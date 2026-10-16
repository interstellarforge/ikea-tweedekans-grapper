import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { ensureDeviceSchema } from "./devices.ts";
import type { IkeaOffer, Store } from "./ikea-client.ts";
import { type PriceTag, priceTag } from "./insights.ts";
import { ensureIpSchema } from "./ips.ts";
import { ensureStatsSchema } from "./stats.ts";

export type StoredOffer = IkeaOffer & {
  storeName: string;
  country: string;
  firstSeen: number;
  lastSeen: number;
  active: boolean;
  followed: boolean;
  tag: PriceTag | undefined;
};

export type StoreRow = {
  storeId: string;
  name: string;
  country: string;
  followed: boolean;
  /** Left out of trip calculations (too far / not wanted). */
  tripExcluded: boolean;
  lastSynced: number | undefined;
  lastError: string | undefined;
  activeOffers: number;
};

export type OfferFilter = {
  q?: string | undefined;
  storeId?: string | undefined;
  sinceMs?: number | undefined;
  scope?: "followed" | "others" | undefined;
  sort?: "new" | "priceAsc" | "priceDesc" | "discount" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

type OfferRow = {
  offer_number: string;
  store_id: string;
  store_name: string | null;
  country: string | null;
  followed: number;
  title: string;
  description: string;
  price: number;
  original_price: number | null;
  currency: string;
  condition: string;
  reason: string;
  image: string | null;
  article_number: string | null;
  first_seen: number;
  last_seen: number;
  active: number;
  prior_low: number | null;
};

const PRUNE_AFTER_MS = 30 * 86_400_000;

export type Db = Database.Database;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stores (
      store_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      followed INTEGER NOT NULL DEFAULT 0,
      last_synced INTEGER,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS watch_items (
      article_number TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type_name TEXT NOT NULL,
      measure TEXT NOT NULL,
      image TEXT,
      url TEXT,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      article_number TEXT NOT NULL,
      name TEXT NOT NULL,
      type_name TEXT NOT NULL,
      measure TEXT NOT NULL,
      image TEXT,
      url TEXT,
      normal_price REAL,
      quantity INTEGER NOT NULL DEFAULT 1,
      added_at INTEGER NOT NULL,
      UNIQUE (list_id, article_number)
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL,
      store_name TEXT,
      purchased_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS home_geo (
      postcode TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trip_cache (
      postcode TEXT NOT NULL,
      store_id TEXT NOT NULL,
      km REAL NOT NULL,
      minutes REAL,
      source TEXT NOT NULL,
      PRIMARY KEY (postcode, store_id)
    );
    CREATE TABLE IF NOT EXISTS store_dist (
      from_store TEXT NOT NULL,
      to_store TEXT NOT NULL,
      km REAL NOT NULL,
      minutes REAL,
      source TEXT NOT NULL,
      PRIMARY KEY (from_store, to_store)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      store_id TEXT NOT NULL,
      offer_number TEXT NOT NULL,
      article_number TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      store_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (store_id, offer_number)
    );
    CREATE TABLE IF NOT EXISTS offers (
      offer_number TEXT NOT NULL,
      store_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      original_price REAL,
      currency TEXT NOT NULL,
      condition TEXT NOT NULL,
      reason TEXT NOT NULL,
      image TEXT,
      article_number TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (store_id, offer_number)
    );
    CREATE INDEX IF NOT EXISTS offers_article ON offers (article_number, active);
    -- Slim, long-lived record: one row per observed price of an offer.
    CREATE TABLE IF NOT EXISTS price_history (
      store_id TEXT NOT NULL,
      offer_number TEXT NOT NULL,
      article_number TEXT NOT NULL,
      price REAL NOT NULL,
      measured_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS price_history_article ON price_history (article_number);
  `);
  const alertCols = (
    db.prepare("PRAGMA table_info(alerts)").all() as { name: string }[]
  ).map((c) => c.name);
  if (!alertCols.includes("note")) {
    db.exec("ALTER TABLE alerts ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  if (!alertCols.includes("delivery")) {
    db.exec("ALTER TABLE alerts ADD COLUMN delivery TEXT NOT NULL DEFAULT ''");
  }
  for (const table of ["trip_cache", "store_dist"]) {
    const cols = (
      db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    ).map((c) => c.name);
    if (!cols.includes("minutes")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN minutes REAL`);
    }
  }
  const storeCols = (
    db.prepare("PRAGMA table_info(stores)").all() as { name: string }[]
  ).map((c) => c.name);
  if (!storeCols.includes("country")) {
    db.exec("ALTER TABLE stores ADD COLUMN country TEXT NOT NULL DEFAULT 'nl'");
  }
  if (!storeCols.includes("enabled")) {
    db.exec("ALTER TABLE stores ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!alertCols.includes("country")) {
    db.exec("ALTER TABLE alerts ADD COLUMN country TEXT NOT NULL DEFAULT 'nl'");
  }
  if (!storeCols.includes("trip_excluded")) {
    db.exec(
      "ALTER TABLE stores ADD COLUMN trip_excluded INTEGER NOT NULL DEFAULT 0",
    );
  }
  // How many pieces are still needed per watched article: derived from shopping lists when the
  // article is on one, otherwise the manual quantity of the watchlist item.
  db.exec(`
    DROP VIEW IF EXISTS watch_need;
    CREATE VIEW watch_need AS
    SELECT w.article_number AS article_number,
      CASE WHEN EXISTS (SELECT 1 FROM list_items li WHERE li.article_number = w.article_number)
        THEN (SELECT COALESCE(SUM(MAX(0, li.quantity - COALESCE(
                (SELECT SUM(p.quantity) FROM purchases p WHERE p.list_item_id = li.id), 0))), 0)
              FROM list_items li WHERE li.article_number = w.article_number)
        ELSE MAX(0, w.quantity - w.bought) END AS needed
    FROM watch_items w;
  `);
  const watchCols = (
    db.prepare("PRAGMA table_info(watch_items)").all() as { name: string }[]
  ).map((c) => c.name);
  if (!watchCols.includes("bought")) {
    db.exec(
      "ALTER TABLE watch_items ADD COLUMN bought INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!watchCols.includes("quantity")) {
    db.exec(
      "ALTER TABLE watch_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1",
    );
  }
  migrateWatchItemsToList(db);
  migrateToMultiUser(db);
  ensureStatsSchema(db);
  ensureIpSchema(db);
  ensureDeviceSchema(db);
  return db;
}

/** One-off: move the single-user shape (and its data) to per-user tables. Idempotent. */
function migrateToMultiUser(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_login INTEGER,
      ntfy_token TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE IF NOT EXISTS user_stores (
      user_id INTEGER NOT NULL,
      store_id TEXT NOT NULL,
      followed INTEGER NOT NULL DEFAULT 0,
      trip_excluded INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, store_id)
    );
  `);
  const cols = (table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
  db.exec("DROP VIEW IF EXISTS watch_need");

  if (!cols("watch_items").includes("user_id")) {
    db.exec(`
      CREATE TABLE watch_items_new (
        user_id INTEGER NOT NULL DEFAULT 0,
        article_number TEXT NOT NULL,
        name TEXT NOT NULL,
        type_name TEXT NOT NULL,
        measure TEXT NOT NULL,
        image TEXT,
        url TEXT,
        added_at INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        bought INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, article_number)
      );
      INSERT INTO watch_items_new (user_id, article_number, name, type_name, measure, image, url, added_at, quantity, bought)
        SELECT 0, article_number, name, type_name, measure, image, url, added_at, quantity, bought FROM watch_items;
      DROP TABLE watch_items;
      ALTER TABLE watch_items_new RENAME TO watch_items;
    `);
  }
  if (!cols("alerts").includes("user_id")) {
    db.exec(`
      CREATE TABLE alerts_new (
        user_id INTEGER NOT NULL DEFAULT 0,
        store_id TEXT NOT NULL,
        offer_number TEXT NOT NULL,
        article_number TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        store_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        seen INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        delivery TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'nl',
        PRIMARY KEY (user_id, store_id, offer_number)
      );
      INSERT INTO alerts_new (user_id, store_id, offer_number, article_number, title, description, price, store_name, created_at, seen, note, delivery, country)
        SELECT 0, store_id, offer_number, article_number, title, description, price, store_name, created_at, seen, note, delivery, country FROM alerts;
      DROP TABLE alerts;
      ALTER TABLE alerts_new RENAME TO alerts;
    `);
  }
  if (!cols("lists").includes("user_id")) {
    db.exec("ALTER TABLE lists ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0");
  }

  const flag = db
    .prepare("SELECT 1 FROM settings WHERE key = 'migrated.multiuser'")
    .get();
  if (!flag) {
    // Per-store flags and personal settings of the single user become "user 0" and are adopted
    // by the first account that is created.
    db.exec(`
      INSERT OR IGNORE INTO user_stores (user_id, store_id, followed, trip_excluded)
        SELECT 0, store_id, followed, trip_excluded FROM stores WHERE followed = 1 OR trip_excluded = 1;
      INSERT OR IGNORE INTO user_settings (user_id, key, value)
        SELECT 0,
               CASE key WHEN 'email.enabled' THEN 'notify.email' WHEN 'ha.enabled' THEN 'notify.ha' ELSE key END,
               value
        FROM settings
        WHERE key IN ('countries','homePostcode','fuelPrice','consumptionPer100km','maxStops','stopMinutes',
                      'hourlyRate','maxTripMinutes','routeAllStores','email.enabled','ha.enabled',
                      'ha.baseUrl','ha.token','ha.targets');
      INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated.multiuser', '1');
    `);
  }

  if (!cols("watch_items").includes("reserved")) {
    db.exec(
      "ALTER TABLE watch_items ADD COLUMN reserved INTEGER NOT NULL DEFAULT 0",
    );
  }
  // Pieces still to buy per watched article of one user (`remaining`): derived from that user's
  // shopping lists when the article is on one, otherwise the manual quantity of the watchlist
  // item. `needed` excludes pieces reserved in the IKEA app (those are off the table for trips).
  db.exec(`
    CREATE VIEW watch_need AS
    SELECT user_id, article_number, remaining, MAX(0, remaining - reserved) AS needed
    FROM (
      SELECT w.user_id AS user_id, w.article_number AS article_number, w.reserved AS reserved,
        CASE WHEN EXISTS (
               SELECT 1 FROM list_items li JOIN lists l ON l.id = li.list_id
               WHERE l.user_id = w.user_id AND li.article_number = w.article_number)
          THEN (SELECT COALESCE(SUM(MAX(0, li.quantity - COALESCE(
                  (SELECT SUM(p.quantity) FROM purchases p WHERE p.list_item_id = li.id), 0))), 0)
                FROM list_items li JOIN lists l ON l.id = li.list_id
                WHERE l.user_id = w.user_id AND li.article_number = w.article_number)
          ELSE MAX(0, w.quantity - w.bought) END AS remaining
      FROM watch_items w
    );
  `);
}

/** One-off: existing watchlist items become the first shopping list ("Boodschappenlijst"). */
function migrateWatchItemsToList(db: Db): void {
  const done = db
    .prepare("SELECT 1 FROM settings WHERE key = 'migrated.lists'")
    .get();
  if (done) return;
  const items = db.prepare("SELECT * FROM watch_items").all() as {
    article_number: string;
    name: string;
    type_name: string;
    measure: string;
    image: string | null;
    url: string | null;
    quantity: number;
    bought: number;
    added_at: number;
  }[];
  db.exec("BEGIN");
  try {
    if (items.length > 0) {
      const listId = Number(
        db
          .prepare("INSERT INTO lists (name, created_at) VALUES (?, ?)")
          .run("Boodschappenlijst", Date.now()).lastInsertRowid,
      );
      const insertItem = db.prepare(
        `INSERT INTO list_items (list_id, article_number, name, type_name, measure, image, url, quantity, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertPurchase = db.prepare(
        "INSERT INTO purchases (list_item_id, quantity, unit_price, store_name, purchased_at) VALUES (?, ?, NULL, NULL, ?)",
      );
      for (const w of items) {
        const itemId = Number(
          insertItem.run(
            listId,
            w.article_number,
            w.name,
            w.type_name,
            w.measure,
            w.image,
            w.url,
            w.quantity,
            w.added_at,
          ).lastInsertRowid,
        );
        if (w.bought > 0) insertPurchase.run(itemId, w.bought, Date.now());
      }
    }
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated.lists', '1')",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Which user is asking, and which countries they have switched on. */
export type Ctx = { userId: number; countries: string[] };

const placeholders = (n: number): string => Array(n).fill("?").join(",");

/** Stores are global (fetched for everyone); per-user flags live in user_stores. */
export function upsertStores(db: Db, stores: Store[], country = "nl"): void {
  const stmt = db.prepare(
    `INSERT INTO stores (store_id, name, country, enabled) VALUES (?, ?, ?, 1)
     ON CONFLICT (store_id) DO UPDATE SET name = excluded.name, country = excluded.country, enabled = 1`,
  );
  for (const s of stores) stmt.run(s.storeId, s.name, country);
}

/**
 * Stores with the user's own flags. Without a context all stores are returned (backend use).
 * Stores outside the NL start excluded from trips until the user opts in.
 */
export function listStores(db: Db, ctx?: Ctx): StoreRow[] {
  const countries = ctx?.countries ?? [];
  const rows = db
    .prepare(
      `SELECT s.store_id AS storeId, s.name, s.country,
              COALESCE(us.followed, 0) AS followed,
              COALESCE(us.trip_excluded, CASE WHEN s.country = 'nl' THEN 0 ELSE 1 END) AS tripExcluded,
              s.last_synced AS lastSynced, s.last_error AS lastError,
              (SELECT COUNT(*) FROM offers o WHERE o.store_id = s.store_id AND o.active = 1) AS activeOffers
       FROM stores s
       LEFT JOIN user_stores us ON us.store_id = s.store_id AND us.user_id = ?
       ${ctx ? `WHERE s.country IN (${placeholders(countries.length)})` : ""}
       ORDER BY s.country, s.name`,
    )
    .all(ctx?.userId ?? -1, ...countries) as {
    storeId: string;
    name: string;
    country: string;
    followed: number;
    tripExcluded: number;
    lastSynced: number | null;
    lastError: string | null;
    activeOffers: number;
  }[];
  return rows.map((r) => ({
    ...r,
    followed: r.followed === 1,
    tripExcluded: r.tripExcluded === 1,
    lastSynced: r.lastSynced ?? undefined,
    lastError: r.lastError ?? undefined,
  }));
}

function upsertUserStore(
  db: Db,
  userId: number,
  storeId: string,
  column: "followed" | "trip_excluded",
  value: boolean,
): void {
  const country = (
    db.prepare("SELECT country FROM stores WHERE store_id = ?").get(storeId) as
      { country: string } | undefined
  )?.country;
  // A user_stores row replaces the defaults, so seed the other column with its default.
  const defaultExcluded = country === "nl" || country === undefined ? 0 : 1;
  db.prepare(
    `INSERT INTO user_stores (user_id, store_id, followed, trip_excluded)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, store_id) DO UPDATE SET ${column} = excluded.${column}`,
  ).run(
    userId,
    storeId,
    column === "followed" ? (value ? 1 : 0) : 0,
    column === "trip_excluded" ? (value ? 1 : 0) : defaultExcluded,
  );
}

export function setFollowed(
  db: Db,
  userId: number,
  storeId: string,
  followed: boolean,
): void {
  upsertUserStore(db, userId, storeId, "followed", followed);
}

export function setTripExcluded(
  db: Db,
  userId: number,
  storeId: string,
  excluded: boolean,
): void {
  upsertUserStore(db, userId, storeId, "trip_excluded", excluded);
}

/** Ids of the users that follow this store (alerts are raised per user). */
export function followersOf(db: Db, storeId: string): number[] {
  return (
    db
      .prepare(
        `SELECT us.user_id AS id FROM user_stores us
         JOIN users u ON u.id = us.user_id
         WHERE us.store_id = ? AND us.followed = 1 AND u.active = 1`,
      )
      .all(storeId) as { id: number }[]
  ).map((r) => r.id);
}

/** Upserts a store's current offers, records price history, deactivates vanished offers. Returns new offers. */
export function syncStoreOffers(
  db: Db,
  storeId: string,
  offers: IkeaOffer[],
  now: number,
): IkeaOffer[] {
  const existing = db.prepare(
    "SELECT price FROM offers WHERE store_id = ? AND offer_number = ?",
  );
  const upsert = db.prepare(`
    INSERT INTO offers (offer_number, store_id, title, description, price, original_price, currency, condition, reason, image, article_number, first_seen, last_seen, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (store_id, offer_number) DO UPDATE SET
      title = excluded.title, description = excluded.description, price = excluded.price,
      original_price = excluded.original_price, condition = excluded.condition, reason = excluded.reason,
      image = excluded.image, last_seen = excluded.last_seen, active = 1
  `);
  const history = db.prepare(
    "INSERT INTO price_history (store_id, offer_number, article_number, price, measured_at) VALUES (?, ?, ?, ?, ?)",
  );
  const added: IkeaOffer[] = [];
  db.exec("BEGIN");
  try {
    for (const o of offers) {
      const prev = existing.get(storeId, o.offerNumber) as
        { price: number } | undefined;
      if (!prev) added.push(o);
      if (o.articleNumber && prev?.price !== o.price) {
        history.run(storeId, o.offerNumber, o.articleNumber, o.price, now);
      }
      upsert.run(
        o.offerNumber,
        storeId,
        o.title,
        o.description,
        o.price,
        o.originalPrice ?? null,
        o.currency,
        o.condition,
        o.reason,
        o.image ?? null,
        o.articleNumber ?? null,
        now,
        now,
      );
    }
    db.prepare(
      "UPDATE offers SET active = 0 WHERE store_id = ? AND last_seen < ?",
    ).run(storeId, now);
    db.prepare(
      "DELETE FROM offers WHERE store_id = ? AND active = 0 AND last_seen < ?",
    ).run(storeId, now - PRUNE_AFTER_MS);
    db.prepare(
      "UPDATE stores SET last_synced = ?, last_error = NULL WHERE store_id = ?",
    ).run(now, storeId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return added;
}

export function recordSyncError(
  db: Db,
  storeId: string,
  message: string,
): void {
  db.prepare("UPDATE stores SET last_error = ? WHERE store_id = ?").run(
    message,
    storeId,
  );
}

const PRIOR_LOW_SQL = `(SELECT MIN(h.price) FROM price_history h
   WHERE h.article_number = o.article_number
     AND NOT (h.store_id = o.store_id AND h.offer_number = o.offer_number))`;

const toOffer = (r: OfferRow): StoredOffer => ({
  offerNumber: r.offer_number,
  storeId: r.store_id,
  storeName: r.store_name ?? r.store_id,
  country: r.country ?? "nl",
  title: r.title,
  description: r.description,
  price: r.price,
  originalPrice: r.original_price ?? undefined,
  currency: r.currency,
  condition: r.condition,
  reason: r.reason,
  image: r.image ?? undefined,
  articleNumber: r.article_number ?? undefined,
  firstSeen: r.first_seen,
  lastSeen: r.last_seen,
  active: r.active === 1,
  followed: r.followed === 1,
  tag: priceTag(r.price, r.prior_low),
});

const ORDER_BY: Record<NonNullable<OfferFilter["sort"]>, string> = {
  new: "o.first_seen DESC, o.title",
  priceAsc: "o.price ASC, o.title",
  priceDesc: "o.price DESC, o.title",
  discount:
    "(CASE WHEN o.original_price > 0 THEN o.price / o.original_price ELSE 1 END) ASC, o.title",
};

export function searchOffers(
  db: Db,
  ctx: Ctx,
  filter: OfferFilter,
): { total: number; items: StoredOffer[] } {
  const where = [
    "o.active = 1",
    `s.country IN (${placeholders(ctx.countries.length)})`,
  ];
  const args: (string | number)[] = [...ctx.countries];
  if (filter.storeId) {
    where.push("o.store_id = ?");
    args.push(filter.storeId);
  }
  if (filter.scope) {
    where.push(
      `COALESCE(us.followed, 0) = ${filter.scope === "followed" ? "1" : "0"}`,
    );
  }
  if (filter.sinceMs !== undefined) {
    where.push("o.first_seen >= ?");
    args.push(filter.sinceMs);
  }
  for (const word of (filter.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)) {
    where.push(
      "lower(o.title || ' ' || o.description || ' ' || ifnull(o.article_number, '')) LIKE ?",
    );
    args.push(`%${word}%`);
  }
  const whereSql = where.join(" AND ");
  const from = `FROM offers o JOIN stores s ON s.store_id = o.store_id
       LEFT JOIN user_stores us ON us.store_id = s.store_id AND us.user_id = ?`;
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n ${from} WHERE ${whereSql}`)
      .get(ctx.userId, ...args) as { n: number }
  ).n;
  const limit = Math.min(Math.max(filter.limit ?? 60, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT o.*, s.name AS store_name, s.country AS country, COALESCE(us.followed, 0) AS followed, ${PRIOR_LOW_SQL} AS prior_low
       ${from}
       WHERE ${whereSql}
       ORDER BY COALESCE(us.followed, 0) DESC, ${ORDER_BY[filter.sort ?? "new"]}
       LIMIT ${String(limit)} OFFSET ${String(offset)}`,
    )
    .all(ctx.userId, ...args) as OfferRow[];
  return { total, items: rows.map(toOffer) };
}

export type ArticleInsight = {
  /** Active offers for this article in all synced stores, cheapest first. */
  offers: StoredOffer[];
  /** Lowest price ever measured for this article. */
  lowestEver: number | undefined;
};

export function articleInsights(
  db: Db,
  ctx: Ctx,
  articleNumbers: string[],
): Record<string, ArticleInsight> {
  const result: Record<string, ArticleInsight> = {};
  const offersStmt = db.prepare(
    `SELECT o.*, s.name AS store_name, s.country AS country, COALESCE(us.followed, 0) AS followed, ${PRIOR_LOW_SQL} AS prior_low
     FROM offers o JOIN stores s ON s.store_id = o.store_id
     LEFT JOIN user_stores us ON us.store_id = s.store_id AND us.user_id = ?
     WHERE o.article_number = ? AND o.active = 1
       AND s.country IN (${placeholders(ctx.countries.length)})
     ORDER BY o.price ASC`,
  );
  const lowStmt = db.prepare(
    "SELECT MIN(price) AS low FROM price_history WHERE article_number = ?",
  );
  for (const article of articleNumbers) {
    const low = lowStmt.get(article) as { low: number | null };
    result[article] = {
      offers: (
        offersStmt.all(ctx.userId, article, ...ctx.countries) as OfferRow[]
      ).map(toOffer),
      lowestEver: low.low ?? undefined,
    };
  }
  return result;
}

export type PricePoint = {
  storeId: string;
  storeName: string;
  offerNumber: string;
  price: number;
  measuredAt: number;
};

export function priceHistory(
  db: Db,
  articleNumber: string,
  limit = 200,
): PricePoint[] {
  return db
    .prepare(
      `SELECT h.store_id AS storeId, ifnull(s.name, h.store_id) AS storeName,
              h.offer_number AS offerNumber, h.price, h.measured_at AS measuredAt
       FROM price_history h LEFT JOIN stores s ON s.store_id = h.store_id
       WHERE h.article_number = ? ORDER BY h.measured_at DESC LIMIT ?`,
    )
    .all(articleNumber, limit) as PricePoint[];
}

/** Basic product info from stored offers, for articles that the catalog search does not return. */
export function offerProductInfo(
  db: Db,
  articleNumber: string,
):
  | { title: string; description: string; image: string | undefined }
  | undefined {
  const row = db
    .prepare(
      `SELECT title, description, image FROM offers
       WHERE article_number = ? ORDER BY last_seen DESC LIMIT 1`,
    )
    .get(articleNumber) as
    { title: string; description: string; image: string | null } | undefined;
  return row && { ...row, image: row.image ?? undefined };
}
