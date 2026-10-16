import { config } from "./config.ts";
import type { Db } from "./db.ts";

export type IpRuleKind = "allow" | "block";

export type IpRule = {
  id: number;
  cidr: string;
  kind: IpRuleKind;
  note: string;
  createdAt: number;
  expiresAt: number | undefined;
};

export type IpVerdict = IpRuleKind | "none";

const V4_BITS = 32;
const V6_BITS = 128;

export function ensureIpSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cidr TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS access_log (
      ts INTEGER NOT NULL,
      ip TEXT NOT NULL,
      path TEXT NOT NULL,
      event TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS access_log_ts ON access_log (ts);
    CREATE INDEX IF NOT EXISTS access_log_ip ON access_log (ip, ts);
    CREATE TABLE IF NOT EXISTS access_daily (
      day TEXT PRIMARY KEY,
      requests INTEGER NOT NULL,
      unique_ips INTEGER NOT NULL,
      logins_ok INTEGER NOT NULL,
      logins_failed INTEGER NOT NULL,
      blocked INTEGER NOT NULL
    );
  `);
  const cols = (
    db.prepare("PRAGMA table_info(users)").all() as { name: string }[]
  ).map((c) => c.name);
  if (!cols.includes("last_seen")) {
    db.exec("ALTER TABLE users ADD COLUMN last_seen INTEGER");
  }
  if (!cols.includes("last_ip")) {
    db.exec("ALTER TABLE users ADD COLUMN last_ip TEXT");
  }
}

/**
 * The caller's IP. `x-forwarded-for` is only trustworthy for the entries our own reverse proxy
 * appended, so count `TRUSTED_PROXY_HOPS` entries from the right (0 = header is ignored).
 */
export function clientIp(request: Request): string {
  const hops = config.trustedProxyHops;
  if (hops < 1) return "unknown";
  const parts = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[Math.max(0, parts.length - hops)] ?? "unknown";
}

/** Numeric value + bit length of an IPv4/IPv6 address; IPv4-mapped IPv6 is treated as IPv4. */
function parseIp(text: string): { value: bigint; bits: number } | undefined {
  const raw = text.trim().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
  const s = mapped?.[1] ?? raw;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    const octets = s.split(".").map(Number);
    if (octets.some((o) => o > 255)) return undefined;
    return {
      value: octets.reduce((acc, o) => (acc << 8n) | BigInt(o), 0n),
      bits: V4_BITS,
    };
  }
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(":")) return undefined;
  const halves = s.split("::");
  if (halves.length > 2) return undefined;
  const groups = (part: string): string[] | undefined => {
    if (part === "") return [];
    const list = part.split(":");
    const last = list[list.length - 1] ?? "";
    if (last.includes(".")) {
      const v4 = parseIp(last);
      if (v4?.bits !== V4_BITS) return undefined;
      list.splice(
        -1,
        1,
        (v4.value >> 16n).toString(16),
        (v4.value & 0xffffn).toString(16),
      );
    }
    return list;
  };
  const head = groups(halves[0] ?? "");
  const tail = groups(halves[1] ?? "");
  if (!head || !tail) return undefined;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined;
  const all = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (all.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return undefined;
  return {
    value: all.reduce((acc, g) => (acc << 16n) | BigInt(`0x${g}`), 0n),
    bits: V6_BITS,
  };
}

/** Normalises "1.2.3.4" or "10.0.0.0/8" (v6 too); undefined when invalid. */
export function normalizeCidr(input: string): string | undefined {
  const [addr, prefix, ...rest] = input.trim().split("/");
  if (rest.length > 0 || addr === undefined) return undefined;
  const ip = parseIp(addr);
  if (!ip) return undefined;
  const length = prefix === undefined ? ip.bits : Number(prefix);
  if (
    prefix === "" ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > ip.bits
  ) {
    return undefined;
  }
  const mask = ((1n << BigInt(length)) - 1n) << BigInt(ip.bits - length);
  const net = ip.value & mask;
  const text =
    ip.bits === V4_BITS
      ? [24n, 16n, 8n, 0n].map((s) => String((net >> s) & 0xffn)).join(".")
      : Array.from({ length: 8 }, (_, i) =>
          ((net >> BigInt((7 - i) * 16)) & 0xffffn).toString(16),
        ).join(":");
  return length === ip.bits ? text : `${text}/${String(length)}`;
}

export function cidrContains(cidr: string, ipText: string): boolean {
  const [net = "", prefix] = cidr.split("/");
  const range = parseIp(net);
  const ip = parseIp(ipText);
  if (range?.bits !== ip?.bits || !range || !ip) return false;
  const length = prefix === undefined ? range.bits : Number(prefix);
  const shift = BigInt(range.bits - length);
  return range.value >> shift === ip.value >> shift;
}

type RuleRow = {
  id: number;
  cidr: string;
  kind: IpRuleKind;
  note: string;
  created_at: number;
  expires_at: number | null;
};

const toRule = (r: RuleRow): IpRule => ({
  id: r.id,
  cidr: r.cidr,
  kind: r.kind,
  note: r.note,
  createdAt: r.created_at,
  expiresAt: r.expires_at ?? undefined,
});

/** Rules that have not expired, newest first. */
export function listIpRules(db: Db, now = Date.now()): IpRule[] {
  return (
    db
      .prepare(
        "SELECT * FROM ip_rules WHERE expires_at IS NULL OR expires_at > ? ORDER BY id DESC",
      )
      .all(now) as RuleRow[]
  ).map(toRule);
}

/** An allow rule always wins over a block rule. */
export function ipVerdict(db: Db, ip: string, now = Date.now()): IpVerdict {
  let verdict: IpVerdict = "none";
  for (const rule of listIpRules(db, now)) {
    if (!cidrContains(rule.cidr, ip)) continue;
    if (rule.kind === "allow") return "allow";
    verdict = "block";
  }
  return verdict;
}

export class IpRuleError extends Error {}

export function addIpRule(
  db: Db,
  input: {
    cidr: string;
    kind: IpRuleKind;
    note: string;
    expiresAt?: number | undefined;
  },
  /** The admin's own IP: refuses a block that would lock them out. */
  ownIp: string,
  now = Date.now(),
): IpRule {
  const cidr = normalizeCidr(input.cidr);
  if (!cidr) throw new IpRuleError("Ongeldig IP-adres of CIDR-bereik");
  if (input.expiresAt !== undefined && input.expiresAt <= now) {
    throw new IpRuleError("De verloopdatum ligt in het verleden");
  }
  if (
    input.kind === "block" &&
    cidrContains(cidr, ownIp) &&
    ipVerdict(db, ownIp, now) !== "allow"
  ) {
    throw new IpRuleError(
      "Dit bereik bevat je eigen IP-adres; je zou jezelf buitensluiten",
    );
  }
  const info = db
    .prepare(
      "INSERT INTO ip_rules (cidr, kind, note, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(cidr, input.kind, input.note.trim(), now, input.expiresAt ?? null);
  return {
    id: Number(info.lastInsertRowid),
    cidr,
    kind: input.kind,
    note: input.note.trim(),
    createdAt: now,
    expiresAt: input.expiresAt,
  };
}

export function deleteIpRule(db: Db, id: number): void {
  db.prepare("DELETE FROM ip_rules WHERE id = ?").run(id);
}
