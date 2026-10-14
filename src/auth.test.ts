import { expect, test } from "vitest";

import { createAuth, parseCookie, SESSION_TTL_MS } from "./auth.ts";

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
