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

export type Auth = {
  enabled: boolean;
  /** Login name (empty when auth is disabled). */
  user: string;
  checkCredentials: (user: string, password: string) => boolean;
  issueToken: (now?: number) => string;
  verifyToken: (token: string | undefined, now?: number) => boolean;
  isLocked: (client: string, now?: number) => boolean;
  recordFailure: (client: string, now?: number) => void;
  clearFailures: (client: string) => void;
};

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

/** Single-user password auth with HMAC-signed, expiring session tokens. */
export function createAuth(options: {
  user: string;
  /** Initial password (env); replaced by a changed password once one is stored. */
  password: string;
  secret: Buffer;
  /** Stored scrypt hash of a password changed through the profile page. */
  getStoredHash?: () => string | undefined;
}): Auth {
  // Sessions are bound to the current password, so changing it logs out other sessions.
  const generation = (): string =>
    createHash("sha256")
      .update(options.getStoredHash?.() ?? "")
      .digest("hex")
      .slice(0, 16);
  const sign = (expiry: string): string =>
    createHmac("sha256", options.secret)
      .update(`session:${expiry}:${generation()}`)
      .digest("base64url");
  const failures = new Map<string, number[]>();
  const recent = (client: string, now: number): number[] =>
    (failures.get(client) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);

  return {
    enabled: true,
    user: options.user,
    checkCredentials: (user, password) => {
      const stored = options.getStoredHash?.();
      // Evaluate both so timing does not reveal which part was wrong.
      const userOk = safeEqual(user, options.user);
      const passwordOk = stored
        ? verifyPassword(password, stored)
        : safeEqual(password, options.password);
      return userOk && passwordOk;
    },
    issueToken: (now = Date.now()) => {
      const expiry = String(now + SESSION_TTL_MS);
      return `${expiry}.${sign(expiry)}`;
    },
    verifyToken: (token, now = Date.now()) => {
      if (!token) return false;
      const [expiry, mac] = token.split(".");
      if (!expiry || !mac || !/^\d+$/.test(expiry)) return false;
      if (Number(expiry) < now) return false;
      return safeEqual(mac, sign(expiry));
    },
    isLocked: (client, now = Date.now()) =>
      recent(client, now).length >= MAX_FAILURES,
    recordFailure: (client, now = Date.now()) => {
      failures.set(client, [...recent(client, now), now]);
    },
    clearFailures: (client) => {
      failures.delete(client);
    },
  };
}

/** Auth that lets everything through (AUTH_DISABLED=true). */
export const noAuth: Auth = {
  enabled: false,
  user: "",
  checkCredentials: () => true,
  issueToken: () => "",
  verifyToken: () => true,
  isLocked: () => false,
  recordFailure: () => undefined,
  clearFailures: () => undefined,
};
