import type { DatabaseSync } from "node:sqlite";

export type StatFormat = "int" | "eur";

export type Stat = {
  key: string;
  group: string;
  label: string;
  value: number;
  format: StatFormat;
};

export type PublicStatsConfig = { enabled: boolean; keys: string[] };

const DAY_MS = 86_400_000;

/** Event counters that cannot be derived from stored rows. */
export type CounterKey =
  | "search_catalog"
  | "search_offers"
  | "logins"
  | "trip_checks"
  | "notifications_sent";

export function ensureStatsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stat_daily (
      day TEXT NOT NULL,
      key TEXT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, key)
    );
  `);
}

export function bump(db: DatabaseSync, key: CounterKey, by = 1): void {
  try {
    db.prepare(
      `INSERT INTO stat_daily (day, key, n) VALUES (?, ?, ?)
       ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n`,
    ).run(new Date().toISOString().slice(0, 10), key, by);
  } catch {
    /* statistics must never break a request */
  }
}

const counter = (db: DatabaseSync, key: CounterKey): number => {
  const row = db
    .prepare("SELECT COALESCE(SUM(n), 0) AS n FROM stat_daily WHERE key = ?")
    .get(key) as { n: number };
  return row.n;
};

const scalar = (db: DatabaseSync, sql: string, ...args: number[]): number => {
  const row = db.prepare(sql).get(...args) as { n: number | null } | undefined;
  return row?.n ?? 0;
};

export function computeStats(db: DatabaseSync, now = Date.now()): Stat[] {
  const s = (
    key: string,
    group: string,
    label: string,
    value: number,
    format: StatFormat = "int",
  ): Stat => ({
    key,
    group,
    label,
    value: format === "eur" ? Math.round(value * 100) / 100 : value,
    format,
  });
  const week = now - 7 * DAY_MS;
  const searches = counter(db, "search_catalog") + counter(db, "search_offers");
  const spent = scalar(
    db,
    "SELECT SUM(quantity * unit_price) AS n FROM purchases WHERE unit_price IS NOT NULL",
  );
  const saved = scalar(
    db,
    `SELECT SUM((li.normal_price - p.unit_price) * p.quantity) AS n
       FROM purchases p JOIN list_items li ON li.id = p.list_item_id
      WHERE li.normal_price IS NOT NULL AND p.unit_price IS NOT NULL
        AND li.normal_price > p.unit_price`,
  );
  return [
    s(
      "users",
      "Gebruikers",
      "Accounts",
      scalar(db, "SELECT COUNT(*) AS n FROM users"),
    ),
    s(
      "users_active_7d",
      "Gebruikers",
      "Actief afgelopen 7 dagen",
      scalar(db, "SELECT COUNT(*) AS n FROM users WHERE last_login > ?", week),
    ),
    s(
      "users_new_7d",
      "Gebruikers",
      "Nieuw afgelopen 7 dagen",
      scalar(db, "SELECT COUNT(*) AS n FROM users WHERE created_at > ?", week),
    ),
    s("logins", "Gebruikers", "Keer ingelogd", counter(db, "logins")),
    s("searches", "Gebruik", "Zoekopdrachten", searches),
    s(
      "search_catalog",
      "Gebruik",
      "Zoekopdrachten in producten",
      counter(db, "search_catalog"),
    ),
    s(
      "search_offers",
      "Gebruik",
      "Zoekopdrachten in het aanbod",
      counter(db, "search_offers"),
    ),
    s(
      "trip_checks",
      "Gebruik",
      "Ritjes doorgerekend",
      counter(db, "trip_checks"),
    ),
    s(
      "watch_items",
      "Lijsten",
      "Producten op watchlists",
      scalar(db, "SELECT COUNT(*) AS n FROM watch_items"),
    ),
    s(
      "watch_articles",
      "Lijsten",
      "Verschillende bewaakte artikelen",
      scalar(db, "SELECT COUNT(DISTINCT article_number) AS n FROM watch_items"),
    ),
    s(
      "lists",
      "Lijsten",
      "Boodschappenlijsten",
      scalar(db, "SELECT COUNT(*) AS n FROM lists"),
    ),
    s(
      "list_items",
      "Lijsten",
      "Producten op boodschappenlijsten",
      scalar(db, "SELECT COUNT(*) AS n FROM list_items"),
    ),
    s(
      "purchases",
      "Aankopen",
      "Aankopen vastgelegd",
      scalar(db, "SELECT COUNT(*) AS n FROM purchases"),
    ),
    s(
      "units_bought",
      "Aankopen",
      "Stuks gekocht",
      scalar(db, "SELECT SUM(quantity) AS n FROM purchases"),
    ),
    s("spent", "Aankopen", "Besteed", spent, "eur"),
    s("saved", "Aankopen", "Bespaard t.o.v. nieuwprijs", saved, "eur"),
    s(
      "offers_active",
      "Aanbod",
      "Aanbiedingen nu",
      scalar(db, "SELECT COUNT(*) AS n FROM offers WHERE active = 1"),
    ),
    s(
      "offers_seen",
      "Aanbod",
      "Aanbiedingen ooit gezien",
      scalar(db, "SELECT COUNT(*) AS n FROM offers"),
    ),
    s(
      "stores",
      "Aanbod",
      "Filialen bijgehouden",
      scalar(db, "SELECT COUNT(*) AS n FROM stores"),
    ),
    s(
      "price_points",
      "Aanbod",
      "Prijsmetingen",
      scalar(db, "SELECT COUNT(*) AS n FROM price_history"),
    ),
    s(
      "alerts",
      "Meldingen",
      "Meldingen aangemaakt",
      scalar(db, "SELECT COUNT(*) AS n FROM alerts"),
    ),
    s(
      "notifications_sent",
      "Meldingen",
      "Berichten verstuurd",
      counter(db, "notifications_sent"),
    ),
  ];
}

export function getPublicStatsConfig(db: DatabaseSync): PublicStatsConfig {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'publicStats'")
    .get() as { value: string } | undefined;
  try {
    const parsed = JSON.parse(row?.value ?? "{}") as Partial<PublicStatsConfig>;
    return {
      enabled: parsed.enabled === true,
      keys: Array.isArray(parsed.keys)
        ? parsed.keys.filter((k): k is string => typeof k === "string")
        : [],
    };
  } catch {
    return { enabled: false, keys: [] };
  }
}

export function savePublicStatsConfig(
  db: DatabaseSync,
  input: PublicStatsConfig,
): PublicStatsConfig {
  const known = new Set(computeStats(db).map((x) => x.key));
  const next: PublicStatsConfig = {
    enabled: input.enabled,
    keys: input.keys.filter((k) => known.has(k)),
  };
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('publicStats', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(next));
  return next;
}

/** What the landing page may show: only chosen stats, and only those that have something to say. */
export function publicStats(db: DatabaseSync): Stat[] {
  const cfg = getPublicStatsConfig(db);
  if (!cfg.enabled) return [];
  const chosen = new Set(cfg.keys);
  return computeStats(db).filter((x) => chosen.has(x.key) && x.value > 0);
}
