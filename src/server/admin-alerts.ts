import { config } from "./config.ts";
import type { Db } from "./db.ts";
import { ipVerdict } from "./ips.ts";
import { deliver } from "./notify.ts";
import { listUsers } from "./users.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const FAILED_LOGINS = 10;
const LIMITED = 5;
export const API_ONLY_MIN_REQUESTS = 50;

export type AdminAlert = {
  id: number;
  ts: number;
  kind: string;
  ip: string;
  detail: string;
};

export const getAdminAlertsEnabled = (db: Db): boolean =>
  (
    db.prepare("SELECT value FROM settings WHERE key = 'adminAlerts'").get() as
      { value: string } | undefined
  )?.value !== "0";

export function setAdminAlertsEnabled(db: Db, on: boolean): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('adminAlerts', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(on ? "1" : "0");
}

export const listAdminAlerts = (db: Db): AdminAlert[] =>
  db
    .prepare("SELECT * FROM admin_alerts ORDER BY id DESC LIMIT 20")
    .all() as AdminAlert[];

/**
 * IPs (outside the known user IPs) that did at least `min` API requests since `from` but never
 * fetched a page: typical for scrapers and scanners. The mobile app's IPs are users' last IPs.
 */
export function apiOnlyIps(db: Db, from: number, min: number): string[] {
  return (
    db
      .prepare(
        `SELECT ip FROM access_log
          WHERE event = 'req' AND ts >= ?
            AND ip NOT IN (SELECT last_ip FROM users WHERE last_ip IS NOT NULL)
          GROUP BY ip
         HAVING SUM(path LIKE '/api/%') >= ? AND SUM(path NOT LIKE '/api/%') = 0`,
      )
      .all(from, min) as { ip: string }[]
  ).map((r) => r.ip);
}

type Finding = { kind: string; ip: string; detail: string };

function findings(db: Db, now: number): Finding[] {
  const ips = (sql: string, ...args: number[]) =>
    db.prepare(sql).all(...args) as { ip: string; n: number }[];
  return [
    ...ips(
      `SELECT ip, COUNT(*) AS n FROM access_log WHERE event = 'login_fail' AND ts >= ?
        GROUP BY ip HAVING n >= ${String(FAILED_LOGINS)}`,
      now - 15 * MINUTE_MS,
    ).map((r) => ({
      kind: "failed_logins",
      ip: r.ip,
      detail: `${String(r.n)} mislukte inlogpogingen in 15 minuten`,
    })),
    ...ips(
      `SELECT ip, COUNT(*) AS n FROM access_log WHERE event = 'limited' AND ts >= ?
        GROUP BY ip HAVING n >= ${String(LIMITED)}`,
      now - 10 * MINUTE_MS,
    ).map((r) => ({
      kind: "rate_limited",
      ip: r.ip,
      detail: `${String(r.n)} verzoeken afgewezen door de rate limit in 10 minuten`,
    })),
    ...apiOnlyIps(db, now - HOUR_MS, API_ONLY_MIN_REQUESTS).map((ip) => ({
      kind: "api_only",
      ip,
      detail: `Alleen API-verzoeken (${String(API_ONLY_MIN_REQUESTS)}+ in het afgelopen uur), geen pagina's`,
    })),
  ];
}

/** Notifies every admin (over their own channels) about suspicious IPs, once per kind/IP per hour. */
export async function checkAdminAlerts(
  db: Db,
  now = Date.now(),
): Promise<void> {
  try {
    if (!getAdminAlertsEnabled(db)) return;
    const fresh = findings(db, now).filter(
      (f) =>
        ipVerdict(db, f.ip, now) !== "allow" &&
        !db
          .prepare(
            "SELECT 1 FROM admin_alerts WHERE kind = ? AND ip = ? AND ts >= ?",
          )
          .get(f.kind, f.ip, now - HOUR_MS),
    );
    if (fresh.length === 0) return;
    const admins = listUsers(db).filter((u) => u.role === "admin" && u.active);
    const click = `${config.appUrl}/admin#verkeer`;
    for (const f of fresh) {
      db.prepare(
        "INSERT INTO admin_alerts (ts, kind, ip, detail) VALUES (?, ?, ?, ?)",
      ).run(now, f.kind, f.ip, f.detail);
      for (const admin of admins) {
        await deliver(db, admin, {
          title: `Beveiligingsmelding: ${f.ip}`,
          body: f.detail,
          links: { click, actions: [] },
          channelId: "offers",
        }).catch((error: unknown) => {
          console.error("[admin-alert]", error);
        });
      }
    }
  } catch (error) {
    console.error("[admin-alert]", error);
  }
}
