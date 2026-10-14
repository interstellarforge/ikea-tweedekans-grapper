import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { IkeaOffer, Store } from "./ikea-client.ts";
import { type PriceTag, priceTag } from "./insights.ts";

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

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
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
  return db;
}

export function upsertStores(
  db: DatabaseSync,
  stores: Store[],
  country = "nl",
): void {
  const stmt = db.prepare(
    `INSERT INTO stores (store_id, name, country, enabled) VALUES (?, ?, ?, 1)
     ON CONFLICT (store_id) DO UPDATE SET name = excluded.name, country = excluded.country, enabled = 1`,
  );
  for (const s of stores) stmt.run(s.storeId, s.name, country);
}

export function listStores(
  db: DatabaseSync,
  options: { includeDisabled?: boolean } = {},
): StoreRow[] {
  const rows = db
    .prepare(
      `SELECT s.store_id AS storeId, s.name, s.country, s.followed, s.trip_excluded AS tripExcluded, s.last_synced AS lastSynced,
              s.last_error AS lastError,
              (SELECT COUNT(*) FROM offers o WHERE o.store_id = s.store_id AND o.active = 1) AS activeOffers
       FROM stores s ${options.includeDisabled ? "" : "WHERE s.enabled = 1"} ORDER BY s.country, s.name`,
    )
    .all() as {
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

export function setFollowed(
  db: DatabaseSync,
  storeId: string,
  followed: boolean,
): void {
  db.prepare("UPDATE stores SET followed = ? WHERE store_id = ?").run(
    followed ? 1 : 0,
    storeId,
  );
}

export function setTripExcluded(
  db: DatabaseSync,
  storeId: string,
  excluded: boolean,
): void {
  db.prepare("UPDATE stores SET trip_excluded = ? WHERE store_id = ?").run(
    excluded ? 1 : 0,
    storeId,
  );
}

export function isFollowed(db: DatabaseSync, storeId: string): boolean {
  const row = db
    .prepare("SELECT followed FROM stores WHERE store_id = ?")
    .get(storeId) as { followed: number } | undefined;
  return row?.followed === 1;
}

/** Upserts a store's current offers, records price history, deactivates vanished offers. Returns new offers. */
export function syncStoreOffers(
  db: DatabaseSync,
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
  db: DatabaseSync,
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
  db: DatabaseSync,
  filter: OfferFilter,
): { total: number; items: StoredOffer[] } {
  const where = ["o.active = 1", "s.enabled = 1"];
  const args: (string | number)[] = [];
  if (filter.storeId) {
    where.push("o.store_id = ?");
    args.push(filter.storeId);
  }
  if (filter.scope) {
    where.push(
      `o.store_id ${filter.scope === "followed" ? "IN" : "NOT IN"} (SELECT store_id FROM stores WHERE followed = 1)`,
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
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM offers o JOIN stores s ON s.store_id = o.store_id WHERE ${whereSql}`,
      )
      .get(...args) as { n: number }
  ).n;
  const limit = Math.min(Math.max(filter.limit ?? 60, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT o.*, s.name AS store_name, s.country AS country, ifnull(s.followed, 0) AS followed, ${PRIOR_LOW_SQL} AS prior_low
       FROM offers o LEFT JOIN stores s ON s.store_id = o.store_id
       WHERE ${whereSql}
       ORDER BY ifnull(s.followed, 0) DESC, ${ORDER_BY[filter.sort ?? "new"]}
       LIMIT ${String(limit)} OFFSET ${String(offset)}`,
    )
    .all(...args) as OfferRow[];
  return { total, items: rows.map(toOffer) };
}

export type ArticleInsight = {
  /** Active offers for this article in all synced stores, cheapest first. */
  offers: StoredOffer[];
  /** Lowest price ever measured for this article. */
  lowestEver: number | undefined;
};

export function articleInsights(
  db: DatabaseSync,
  articleNumbers: string[],
): Record<string, ArticleInsight> {
  const result: Record<string, ArticleInsight> = {};
  const offersStmt = db.prepare(
    `SELECT o.*, s.name AS store_name, s.country AS country, ifnull(s.followed, 0) AS followed, ${PRIOR_LOW_SQL} AS prior_low
     FROM offers o LEFT JOIN stores s ON s.store_id = o.store_id
     WHERE o.article_number = ? AND o.active = 1 AND s.enabled = 1 ORDER BY o.price ASC`,
  );
  const lowStmt = db.prepare(
    "SELECT MIN(price) AS low FROM price_history WHERE article_number = ?",
  );
  for (const article of articleNumbers) {
    const low = lowStmt.get(article) as { low: number | null };
    result[article] = {
      offers: (offersStmt.all(article) as OfferRow[]).map(toOffer),
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
  db: DatabaseSync,
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
  db: DatabaseSync,
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
