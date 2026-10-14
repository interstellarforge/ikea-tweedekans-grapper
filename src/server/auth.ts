import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_MS = 30 * 86_400_000;

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

/** scrypt hash in the form "scrypt:<salt>:<hash>" (base64). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), 32);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

const safeEqual = (a: string, b: string): boolean =>
  timingSafeEqual(digest(a), digest(b));

export function parseCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The part of the password hash that binds a session to the current password. */
const fingerprint = (passwordHash: string): string =>
  createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);

const sign = (
  secret: Buffer,
  userId: number,
  expiry: string,
  passwordHash: string,
): string =>
  createHmac("sha256", secret)
    .update(`session:${String(userId)}:${expiry}:${fingerprint(passwordHash)}`)
    .digest("base64url");

/** Session token "<userId>.<expiry>.<mac>"; invalid as soon as the password changes. */
export function issueSession(
  secret: Buffer,
  userId: number,
  passwordHash: string,
  now = Date.now(),
): string {
  const expiry = String(now + SESSION_TTL_MS);
  return `${String(userId)}.${expiry}.${sign(secret, userId, expiry, passwordHash)}`;
}

/** Returns the user id when the token is genuine, unexpired and matches the user's password. */
export function verifySession(
  secret: Buffer,
  token: string | undefined,
  passwordHashOf: (userId: number) => string | undefined,
  now = Date.now(),
): number | undefined {
  if (!token) return undefined;
  const [idPart, expiry, mac] = token.split(".");
  if (!idPart || !expiry || !mac) return undefined;
  if (!/^\d+$/.test(idPart) || !/^\d+$/.test(expiry)) return undefined;
  if (Number(expiry) < now) return undefined;
  const userId = Number(idPart);
  const passwordHash = passwordHashOf(userId);
  if (passwordHash === undefined) return undefined;
  return safeEqual(mac, sign(secret, userId, expiry, passwordHash))
    ? userId
    : undefined;
}

/** In-memory limiter for failed logins per client (IP). */
export class LoginLimiter {
  private failures = new Map<string, number[]>();

  private recent(client: string, now: number): number[] {
    return (this.failures.get(client) ?? []).filter(
      (t) => now - t < FAILURE_WINDOW_MS,
    );
  }

  isLocked(client: string, now = Date.now()): boolean {
    return this.recent(client, now).length >= MAX_FAILURES;
  }

  recordFailure(client: string, now = Date.now()): void {
    this.failures.set(client, [...this.recent(client, now), now]);
  }

  clear(client: string): void {
    this.failures.delete(client);
  }
}
