import { expect, test } from "vitest";

import { openDb } from "./db.ts";
import {
  bump,
  computeStats,
  publicStats,
  savePublicStatsConfig,
} from "./stats.ts";

test("stats: counters add up and only chosen non-zero stats are public", () => {
  const db = openDb(":memory:");
  bump(db, "search_catalog");
  bump(db, "search_catalog");
  bump(db, "search_offers");
  const byKey = new Map(computeStats(db).map((s) => [s.key, s.value]));
  expect(byKey.get("searches")).toBe(3);

  expect(publicStats(db)).toEqual([]);
  savePublicStatsConfig(db, {
    enabled: true,
    keys: ["searches", "spent", "bogus"],
  });
  // "spent" is 0 and "bogus" is unknown: neither may reach the landing page.
  expect(publicStats(db).map((s) => s.key)).toEqual(["searches"]);
  savePublicStatsConfig(db, { enabled: false, keys: ["searches"] });
  expect(publicStats(db)).toEqual([]);
});
