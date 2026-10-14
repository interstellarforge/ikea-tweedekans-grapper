import { expect, test } from "vitest";

import {
  hashPassword,
  issueSession,
  LoginLimiter,
  parseCookie,
  SESSION_TTL_MS,
  verifyPassword,
  verifySession,
} from "./auth.ts";

const secret = Buffer.alloc(32, 7);

test("passwords are hashed and verified", () => {
  const hash = hashPassword("correct horse");
  expect(hash.startsWith("scrypt:")).toBe(true);
  expect(verifyPassword("correct horse", hash)).toBe(true);
  expect(verifyPassword("wrong", hash)).toBe(false);
  expect(verifyPassword("anything", "garbage")).toBe(false);
});

test("session tokens are bound to user, expiry and password", () => {
  const hashes: Record<number, string> = {
    1: hashPassword("a"),
    2: hashPassword("b"),
  };
  const lookup = (id: number) => hashes[id];
  const token = issueSession(secret, 1, hashes[1] ?? "", 1000);

  expect(verifySession(secret, token, lookup, 2000)).toBe(1);
  expect(
    verifySession(secret, token, lookup, 1000 + SESSION_TTL_MS + 1),
  ).toBeUndefined();
  expect(verifySession(secret, undefined, lookup)).toBeUndefined();
  expect(verifySession(secret, "garbage", lookup)).toBeUndefined();

  // another user's id in the same token must not validate
  const [, expiry = "", mac = ""] = token.split(".");
  expect(
    verifySession(secret, `2.${expiry}.${mac}`, lookup, 2000),
  ).toBeUndefined();
  // a token from a different secret is rejected
  expect(
    verifySession(Buffer.alloc(32, 1), token, lookup, 2000),
  ).toBeUndefined();

  // changing the password invalidates existing sessions
  hashes[1] = hashPassword("new");
  expect(verifySession(secret, token, lookup, 2000)).toBeUndefined();
  // a deleted user has no session
  expect(verifySession(secret, token, () => undefined, 2000)).toBeUndefined();
  expect(parseCookie("a=1; session=abc%2E1", "session")).toBe("abc.1");
});

test("locks a client after repeated failures", () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 5; i++) limiter.recordFailure("1.2.3.4", 1000 + i);
  expect(limiter.isLocked("1.2.3.4", 2000)).toBe(true);
  expect(limiter.isLocked("5.6.7.8", 2000)).toBe(false);
  expect(limiter.isLocked("1.2.3.4", 1000 + 16 * 60_000)).toBe(false);
  limiter.clear("1.2.3.4");
  expect(limiter.isLocked("1.2.3.4", 2000)).toBe(false);
});
