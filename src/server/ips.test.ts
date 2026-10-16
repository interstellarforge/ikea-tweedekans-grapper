import { expect, test } from "vitest";
import { checkAdminAlerts } from "./admin-alerts.ts";

import { openDb } from "./db.ts";
import {
  addIpRule,
  cidrContains,
  IpRuleError,
  ipVerdict,
  normalizeCidr,
} from "./ips.ts";
import { RateLimiter } from "./ips.ts";
import { computeTraffic, logAccess, purgeAccessLog } from "./stats.ts";

test("cidr: v4/v6 ranges match, mapped v4 and invalid input are handled", () => {
  expect(cidrContains("10.0.0.0/8", "10.200.1.2")).toBe(true);
  expect(cidrContains("10.0.0.0/8", "11.0.0.1")).toBe(false);
  expect(cidrContains("2001:db8::/32", "2001:db8:abcd::1")).toBe(true);
  expect(cidrContains("2001:db8::/32", "2001:db9::1")).toBe(false);
  expect(cidrContains("1.2.3.4", "::ffff:1.2.3.4")).toBe(true);
  expect(cidrContains("10.0.0.0/8", "2001:db8::1")).toBe(false);
  expect(normalizeCidr("10.1.2.3/8")).toBe("10.0.0.0/8");
  expect(normalizeCidr("300.1.1.1")).toBeUndefined();
  expect(normalizeCidr("10.0.0.0/33")).toBeUndefined();
});

test("ip rules: allow beats block, expired rules are ignored, self-block refused", () => {
  const db = openDb(":memory:");
  const now = 1_000_000;
  addIpRule(
    db,
    { cidr: "5.5.0.0/16", kind: "block", note: "" },
    "1.1.1.1",
    now,
  );
  expect(ipVerdict(db, "5.5.5.5", now)).toBe("block");

  addIpRule(db, { cidr: "5.5.5.5", kind: "allow", note: "" }, "1.1.1.1", now);
  expect(ipVerdict(db, "5.5.5.5", now)).toBe("allow");

  addIpRule(
    db,
    { cidr: "6.6.6.6", kind: "block", note: "", expiresAt: now + 10 },
    "1.1.1.1",
    now,
  );
  expect(ipVerdict(db, "6.6.6.6", now)).toBe("block");
  expect(ipVerdict(db, "6.6.6.6", now + 11)).toBe("none");

  expect(() =>
    addIpRule(
      db,
      { cidr: "1.1.0.0/16", kind: "block", note: "" },
      "1.1.1.1",
      now,
    ),
  ).toThrow(IpRuleError);
});

test("traffic: raw rows older than retention roll up per day and are dropped", () => {
  const db = openDb(":memory:");
  logAccess(db, "9.9.9.9", "/api/product/123", "req");
  db.prepare(
    "INSERT INTO access_log (ts, ip, path, event) VALUES (?, '8.8.8.8', '/x', 'req')",
  ).run(Date.now() - 90 * 86_400_000);
  purgeAccessLog(db);
  const t = computeTraffic(db);
  expect(t.paths[0]?.path).toBe("/api/product/:id");
  expect(t.days).toHaveLength(2);
  expect(db.prepare("SELECT COUNT(*) AS n FROM access_log").get()).toEqual({
    n: 1,
  });
});

test("rate limiter: over the limit within a minute, free again after", () => {
  const limiter = new RateLimiter();
  expect([1, 2, 3].map(() => limiter.exceeded("a", 2, 1000))).toEqual([
    false,
    false,
    true,
  ]);
  expect(limiter.exceeded("a", 2, 62_000)).toBe(false);
});

test("admin alerts: api-only IP is flagged once, allow-listed IP never", async () => {
  const db = openDb(":memory:");
  for (const ip of ["3.3.3.3", "4.4.4.4"]) {
    for (let i = 0; i < 60; i++) logAccess(db, ip, "/api/catalog", "req");
  }
  addIpRule(db, { cidr: "4.4.4.4", kind: "allow", note: "" }, "1.1.1.1");
  await checkAdminAlerts(db);
  await checkAdminAlerts(db);
  expect(db.prepare("SELECT ip, kind FROM admin_alerts").all()).toEqual([
    { ip: "3.3.3.3", kind: "api_only" },
  ]);
});
