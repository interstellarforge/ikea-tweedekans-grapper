import { expect, test } from "vitest";

import { openDb, syncStoreOffers, upsertStores } from "./db.ts";
import {
  addListItem,
  collectReserved,
  createList,
  getLists,
  ownsItem,
  ownsList,
  purchaseByArticle,
  recordPieces,
  setItemWatched,
} from "./lists.ts";
import {
  addWatchItem,
  isWatched,
  listWatchItems,
  setQuantity,
  setReserved,
} from "./watchlist.ts";

const product = (articleNumber: string, normalPrice?: number) => ({
  articleNumber,
  name: "KOMPLEMENT",
  typeName: "Plank",
  measure: "50x58",
  image: undefined,
  url: undefined,
  normalPrice,
});

const NL = ["nl"];

test("lists track pieces, prices and what is still needed", () => {
  const db = openDb(":memory:");
  const me = 1;
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
  const kitchen = createList(db, me, "Keuken", 1);
  const bedroom = createList(db, me, "Slaapkamer", 1);

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
  expect(isWatched(db, me, "70277981")).toBe(false);

  const itemId = getLists(db, me, NL)[0]?.items[0]?.id ?? 0;
  setItemWatched(db, me, itemId, true, 2);

  expect(isWatched(db, me, "70277981")).toBe(true);
  // needed = remaining over both lists
  expect(listWatchItems(db, me, NL)[0]?.needed).toBe(6);

  // bought 1 piece at EUR 3.50: remaining 3 in kitchen
  expect(recordPieces(db, itemId, [3.5], "Amsterdam", 3)).toBe(1);
  expect(listWatchItems(db, me, NL)[0]?.needed).toBe(5);

  const view = getLists(db, me, NL)[0];

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
    me,
    [{ articleNumber: "70277981", count: 2, unitPrice: 4 }],
    5,
  );

  expect(getLists(db, me, NL)[1]?.items[0]?.bought).toBe(2);
  expect(listWatchItems(db, me, NL)[0]?.needed).toBe(0);
});

test("lists, items and purchases belong to one user only", () => {
  const db = openDb(":memory:");
  const alice = createList(db, 1, "Keuken", 1);
  addListItem(db, alice, product("70277981"), 2, "max", 1);
  const itemId = getLists(db, 1, NL)[0]?.items[0]?.id ?? 0;
  recordPieces(db, itemId, [3], undefined, 2);

  expect(ownsList(db, 1, alice)).toBe(true);
  expect(ownsList(db, 2, alice)).toBe(false);
  expect(ownsItem(db, 1, itemId)).toBe(true);
  expect(ownsItem(db, 2, itemId)).toBe(false);
  expect(getLists(db, 2, NL)).toHaveLength(0);

  // a trip purchase by another user must not touch Alice's list
  purchaseByArticle(
    db,
    2,
    [{ articleNumber: "70277981", count: 1, unitPrice: 3 }],
    3,
  );

  expect(getLists(db, 1, NL)[0]?.items[0]?.bought).toBe(1);
});

test("reserved pieces drop out of what is needed until collected or released", () => {
  const db = openDb(":memory:");
  addWatchItem(db, 1, product("70277981"), 1);
  setQuantity(db, 1, "70277981", 3);
  setReserved(db, 1, "70277981", 2);
  expect(listWatchItems(db, 1, NL)[0]).toMatchObject({
    needed: 1,
    reserved: 2,
  });

  setReserved(db, 1, "70277981", 9); // clamped to what is left to buy
  expect(listWatchItems(db, 1, NL)[0]?.reserved).toBe(3);

  setReserved(db, 1, "70277981", 2);
  collectReserved(db, 1, "70277981", 5);
  expect(listWatchItems(db, 1, NL)[0]).toMatchObject({
    needed: 1,
    reserved: 0,
    bought: 2,
  });
});
