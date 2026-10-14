import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_MS = 30 * 86_400_000;

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

export type Auth = {
  enabled: boolean;
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
  password: string;
  secret: Buffer;
}): Auth {
  const sign = (expiry: string): string =>
    createHmac("sha256", options.secret)
      .update(`session:${expiry}`)
      .digest("base64url");
  const failures = new Map<string, number[]>();
  const recent = (client: string, now: number): number[] =>
    (failures.get(client) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);

  return {
    enabled: true,
    checkCredentials: (user, password) =>
      // Evaluate both so timing does not reveal which part was wrong.
      [
        safeEqual(user, options.user),
        safeEqual(password, options.password),
      ].every(Boolean),
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
  checkCredentials: () => true,
  issueToken: () => "",
  verifyToken: () => true,
  isLocked: () => false,
  recordFailure: () => undefined,
  clearFailures: () => undefined,
};
