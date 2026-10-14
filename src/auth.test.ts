import { expect, test } from "vitest";

import {
  createAuth,
  hashPassword,
  parseCookie,
  SESSION_TTL_MS,
  verifyPassword,
} from "./auth.ts";

const auth = createAuth({
  user: "kees",
  password: "correct horse",
  secret: Buffer.alloc(32, 7),
});

test("credentials and session tokens", () => {
  expect(auth.checkCredentials("kees", "correct horse")).toBe(true);
  expect(auth.checkCredentials("kees", "wrong")).toBe(false);
  expect(auth.checkCredentials("admin", "correct horse")).toBe(false);

  const token = auth.issueToken(1000);
  expect(auth.verifyToken(token, 2000)).toBe(true);
  expect(auth.verifyToken(token, 1000 + SESSION_TTL_MS + 1)).toBe(false);
  const [expiry = "", mac = ""] = token.split(".");
  expect(auth.verifyToken(`${String(Number(expiry) + 1)}.${mac}`, 2000)).toBe(
    false,
  );
  expect(auth.verifyToken(undefined)).toBe(false);
  expect(parseCookie("a=1; session=abc%2E1", "session")).toBe("abc.1");
});

test("locks a client after repeated failures", () => {
  for (let i = 0; i < 5; i++) auth.recordFailure("1.2.3.4", 1000 + i);
  expect(auth.isLocked("1.2.3.4", 2000)).toBe(true);
  expect(auth.isLocked("5.6.7.8", 2000)).toBe(false);
  expect(auth.isLocked("1.2.3.4", 1000 + 16 * 60_000)).toBe(false);
});

test("changed password replaces the env password and invalidates old sessions", () => {
  const state: { hash?: string } = {};
  const a = createAuth({
    user: "kees",
    password: "envpassword",
    secret: Buffer.alloc(32, 9),
    getStoredHash: () => state.hash,
  });
  const oldToken = a.issueToken(1000);
  expect(a.checkCredentials("kees", "envpassword")).toBe(true);
  expect(a.verifyToken(oldToken, 2000)).toBe(true);

  state.hash = hashPassword("new-password-123");
  expect(verifyPassword("new-password-123", state.hash)).toBe(true);
  expect(verifyPassword("nope", state.hash)).toBe(false);
  expect(a.checkCredentials("kees", "new-password-123")).toBe(true);
  expect(a.checkCredentials("kees", "envpassword")).toBe(false);
  expect(a.verifyToken(oldToken, 2000)).toBe(false);
  expect(a.verifyToken(a.issueToken(1000), 2000)).toBe(true);
});
