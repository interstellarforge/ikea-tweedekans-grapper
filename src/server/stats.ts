import type { Db } from "./db.ts";
import { ipVerdict, type IpVerdict } from "./ips.ts";

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
  | "login_failed"
  | "blocked_requests"
  | "trip_checks"
  | "notifications_sent";

export function ensureStatsSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stat_daily (
      day TEXT NOT NULL,
      key TEXT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, key)
    );
  `);
}

export function bump(db: Db, key: CounterKey, by = 1): void {
  try {
    db.prepare(
      `INSERT INTO stat_daily (day, key, n) VALUES (?, ?, ?)
       ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n`,
    ).run(new Date().toISOString().slice(0, 10), key, by);
  } catch {
    /* statistics must never break a request */
  }
}

const counter = (db: Db, key: CounterKey): number => {
  const row = db
    .prepare("SELECT COALESCE(SUM(n), 0) AS n FROM stat_daily WHERE key = ?")
    .get(key) as { n: number };
  return row.n;
};

const scalar = (db: Db, sql: string, ...args: (number | string)[]): number => {
  const row = db.prepare(sql).get(...args) as { n: number | null } | undefined;
  return row?.n ?? 0;
};

export function computeStats(db: Db, now = Date.now()): Stat[] {
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
    s(
      "login_failed",
      "Gebruikers",
      "Mislukte inlogpogingen",
      counter(db, "login_failed"),
    ),
    s(
      "blocked_requests",
      "Gebruikers",
      "Geweigerde verzoeken (IP-blokkade)",
      counter(db, "blocked_requests"),
    ),
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

export function getPublicStatsConfig(db: Db): PublicStatsConfig {
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
  db: Db,
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
export function publicStats(db: Db): Stat[] {
  const cfg = getPublicStatsConfig(db);
  if (!cfg.enabled) return [];
  const chosen = new Set(cfg.keys);
  return computeStats(db).filter((x) => chosen.has(x.key) && x.value > 0);
}

// ---- Traffic (raw IP log with retention, rolled up per day afterwards) ----

export type AccessEvent = "req" | "blocked" | "login_ok" | "login_fail";

const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;
const LOCAL_DAY = "strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime')";

/** Collapses ids so `/api/product/123` and `/api/product/456` count as one path. */
const normalizePath = (path: string): string =>
  path
    .split("/")
    .map((seg) =>
      /^\d+$/.test(seg) || /^[0-9a-f-]{20,}$/i.test(seg) ? ":id" : seg,
    )
    .join("/")
    .slice(0, 120);

export function logAccess(
  db: Db,
  ip: string,
  path: string,
  event: AccessEvent,
): void {
  try {
    db.prepare(
      "INSERT INTO access_log (ts, ip, path, event) VALUES (?, ?, ?, ?)",
    ).run(Date.now(), ip, normalizePath(path), event);
  } catch {
    /* statistics must never break a request */
  }
}

export function recordLogin(
  db: Db,
  ip: string,
  path: string,
  ok: boolean,
): void {
  bump(db, ok ? "logins" : "login_failed");
  logAccess(db, ip, path, ok ? "login_ok" : "login_fail");
}

export function getRetentionDays(db: Db): number {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'accessLogDays'")
    .get() as { value: string } | undefined;
  const days = Number(row?.value);
  return Number.isInteger(days) && days >= 1 && days <= MAX_RETENTION_DAYS
    ? days
    : DEFAULT_RETENTION_DAYS;
}

export function setRetentionDays(db: Db, days: number): number {
  const next = Math.min(MAX_RETENTION_DAYS, Math.max(1, Math.round(days)));
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('accessLogDays', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(String(next));
  return next;
}

/** Rolls raw rows older than the retention window into per-day totals, then drops them. */
export function purgeAccessLog(db: Db, now = Date.now()): void {
  const cutoff = new Date(now - getRetentionDays(db) * DAY_MS).setHours(
    0,
    0,
    0,
    0,
  );
  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO access_daily
         (day, requests, unique_ips, logins_ok, logins_failed, blocked)
       SELECT ${LOCAL_DAY} AS d,
              SUM(event = 'req'), COUNT(DISTINCT ip),
              SUM(event = 'login_ok'), SUM(event = 'login_fail'),
              SUM(event = 'blocked')
         FROM access_log WHERE ts < ? GROUP BY d`,
    ).run(cutoff);
    db.prepare("DELETE FROM access_log WHERE ts < ?").run(cutoff);
    db.prepare(
      "DELETE FROM ip_rules WHERE expires_at IS NOT NULL AND expires_at <= ?",
    ).run(now);
  })();
}

export type Traffic = {
  retentionDays: number;
  windows: { label: string; requests: number; ips: number }[];
  logins: { ok24h: number; failed24h: number; ok7d: number; failed7d: number };
  days: {
    day: string;
    requests: number;
    uniqueIps: number;
    loginsOk: number;
    loginsFailed: number;
    blocked: number;
  }[];
  /** Requests per hour of the day (0-23) over the raw log window. */
  hours: number[];
  paths: { path: string; n: number }[];
  ips: {
    ip: string;
    requests: number;
    lastSeen: number;
    failedLogins: number;
    blocked: number;
    verdict: IpVerdict;
  }[];
  users: {
    id: number;
    email: string;
    lastSeen: number | undefined;
    lastIp: string | undefined;
  }[];
};

export function computeTraffic(db: Db, now = Date.now()): Traffic {
  const since = (days: number) => now - days * DAY_MS;
  const win = (label: string, from: number) => {
    const row = db
      .prepare(
        `SELECT SUM(event = 'req') AS requests, COUNT(DISTINCT ip) AS ips
           FROM access_log WHERE ts >= ?`,
      )
      .get(from) as { requests: number | null; ips: number };
    return { label, requests: row.requests ?? 0, ips: row.ips };
  };
  const loginCount = (event: string, from: number) =>
    scalar(
      db,
      "SELECT COUNT(*) AS n FROM access_log WHERE event = ? AND ts >= ?",
      event,
      from,
    );
  const rawDays = db
    .prepare(
      `SELECT ${LOCAL_DAY} AS day, SUM(event = 'req') AS requests,
              COUNT(DISTINCT ip) AS uniqueIps, SUM(event = 'login_ok') AS loginsOk,
              SUM(event = 'login_fail') AS loginsFailed, SUM(event = 'blocked') AS blocked
         FROM access_log GROUP BY day`,
    )
    .all() as Traffic["days"];
  const seen = new Set(rawDays.map((d) => d.day));
  const rolled = (
    db.prepare("SELECT * FROM access_daily").all() as {
      day: string;
      requests: number;
      unique_ips: number;
      logins_ok: number;
      logins_failed: number;
      blocked: number;
    }[]
  )
    .filter((d) => !seen.has(d.day))
    .map((d) => ({
      day: d.day,
      requests: d.requests,
      uniqueIps: d.unique_ips,
      loginsOk: d.logins_ok,
      loginsFailed: d.logins_failed,
      blocked: d.blocked,
    }));
  const hours = Array<number>(24).fill(0);
  for (const r of db
    .prepare(
      `SELECT CAST(strftime('%H', ts / 1000, 'unixepoch', 'localtime') AS INTEGER) AS h,
              COUNT(*) AS n FROM access_log WHERE event = 'req' GROUP BY h`,
    )
    .all() as { h: number; n: number }[]) {
    hours[r.h] = r.n;
  }
  const ips = (
    db
      .prepare(
        `SELECT ip, SUM(event = 'req') AS requests, MAX(ts) AS lastSeen,
                SUM(event = 'login_fail') AS failedLogins, SUM(event = 'blocked') AS blocked
           FROM access_log WHERE ts >= ? GROUP BY ip ORDER BY requests DESC, lastSeen DESC LIMIT 25`,
      )
      .all(since(7)) as Omit<Traffic["ips"][number], "verdict">[]
  ).map((r) => ({ ...r, verdict: ipVerdict(db, r.ip, now) }));
  const users = (
    db
      .prepare(
        `SELECT id, email, last_seen, last_ip FROM users
          ORDER BY last_seen IS NULL, last_seen DESC LIMIT 25`,
      )
      .all() as {
      id: number;
      email: string;
      last_seen: number | null;
      last_ip: string | null;
    }[]
  ).map((u) => ({
    id: u.id,
    email: u.email,
    lastSeen: u.last_seen ?? undefined,
    lastIp: u.last_ip ?? undefined,
  }));
  return {
    retentionDays: getRetentionDays(db),
    windows: [
      win("Laatste 24 uur", since(1)),
      win("Laatste 7 dagen", since(7)),
      win("Hele logperiode", 0),
    ],
    logins: {
      ok24h: loginCount("login_ok", since(1)),
      failed24h: loginCount("login_fail", since(1)),
      ok7d: loginCount("login_ok", since(7)),
      failed7d: loginCount("login_fail", since(7)),
    },
    days: [...rawDays, ...rolled]
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, 30),
    hours,
    paths: db
      .prepare(
        `SELECT path, COUNT(*) AS n FROM access_log WHERE event = 'req' AND ts >= ?
          GROUP BY path ORDER BY n DESC LIMIT 10`,
      )
      .all(since(7)) as Traffic["paths"],
    ips,
    users,
  };
}
