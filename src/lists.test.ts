import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { openDb, syncStoreOffers, upsertStores } from "./db.ts";
import {
  addListItem,
  createList,
  getLists,
  purchaseByArticle,
  recordPieces,
  setItemWatched,
} from "./lists.ts";
import { isWatched, listWatchItems } from "./watchlist.ts";

const product = (articleNumber: string, normalPrice?: number) => ({
  articleNumber,
  name: "KOMPLEMENT",
  typeName: "Plank",
  measure: "50x58",
  image: undefined,
  url: undefined,
  normalPrice,
});

test("lists track pieces, prices and what is still needed", () => {
  const db = openDb(":memory:");
  upsertStores(db, [{ storeId: "088", name: "Amsterdam" }], "nl");
  syncStoreOffers(
    db,
    "088",
    [
      {
        offerNumber: "1",
        storeId: "088",
        title: "KOMPLEMENT",
        description: "plank",
        price: 4,
        originalPrice: 9,
        currency: "EUR",
        condition: "Goed",
        reason: "",
        image: undefined,
        articleNumber: "70277981",
      },
    ],
    1000,
  );
  const kitchen = createList(db, "Keuken", 1);
  const bedroom = createList(db, "Slaapkamer", 1);
  expect(addListItem(db, kitchen, product("70277981", 9), 4, "max", 1)).toBe(
    "added",
  );
  expect(addListItem(db, bedroom, product("70277981", 9), 2, "max", 1)).toBe(
    "added",
  );
  expect(addListItem(db, kitchen, product("70277981", 9), 4, "max", 1)).toBe(
    "unchanged",
  );

  // not watched yet: nothing is monitored
  expect(isWatched(db, "70277981")).toBe(false);
  const itemId = getLists(db)[0]?.items[0]?.id ?? 0;
  setItemWatched(db, itemId, true, 2);
  expect(isWatched(db, "70277981")).toBe(true);
  // needed = remaining over both lists
  expect(listWatchItems(db)[0]?.needed).toBe(6);

  // bought 1 piece at EUR 3.50: remaining 3 in kitchen
  expect(recordPieces(db, itemId, [3.5], "Amsterdam", 3)).toBe(1);
  expect(listWatchItems(db)[0]?.needed).toBe(5);
  const view = getLists(db)[0];
  expect(view?.items[0]).toMatchObject({
    bought: 1,
    remaining: 3,
    paid: 3.5,
    estimateUnit: 4, // cheapest current offer
    estimateSource: "tweedekans",
    lineTotal: 15.5, // 3.50 paid + 3 x 4
  });
  expect(view?.totals).toMatchObject({
    paid: 3.5,
    total: 15.5,
    atNewPrice: 36,
    saving: 20.5,
  });

  // never more than what is needed
  expect(recordPieces(db, itemId, [1, 1, 1, 1, 1], undefined, 4)).toBe(3);

  // trip purchase goes to the oldest list that still needs pieces (slaapkamer here)
  purchaseByArticle(
    db,
    [{ articleNumber: "70277981", count: 2, unitPrice: 4 }],
    5,
  );
  expect(getLists(db)[1]?.items[0]?.bought).toBe(2);
  expect(listWatchItems(db)[0]?.needed).toBe(0);
});

test("existing watchlist items become the first shopping list", () => {
  const dir = mkdtempSync(join(tmpdir(), "tweedekans-"));
  const path = join(dir, "t.db");
  try {
    const first = openDb(path);
    first
      .prepare(
        "INSERT INTO watch_items (article_number, name, type_name, measure, added_at, quantity, bought) VALUES ('90591705', 'METOD', 'kast', '', 1, 3, 1)",
      )
      .run();
    // simulate a database from before shopping lists existed
    first.prepare("DELETE FROM settings WHERE key = 'migrated.lists'").run();
    first.prepare("DELETE FROM lists").run();
    first.close();

    const db = openDb(path);
    const lists = getLists(db);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.items[0]).toMatchObject({
      quantity: 3,
      bought: 1,
      remaining: 2,
    });
    // opening again must not migrate a second time
    db.close();
    expect(getLists(openDb(path))).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
