import { expect, test } from "vitest";

import {
  articleInsights,
  followersOf,
  listStores,
  openDb,
  searchOffers,
  setFollowed,
  setTripExcluded,
  syncStoreOffers,
  upsertStores,
} from "./db.ts";
import type { IkeaOffer } from "./ikea-client.ts";
import { createUser } from "./users.ts";

const offer = (
  offerNumber: string,
  title: string,
  price = 10,
  storeId = "088",
): IkeaOffer => ({
  offerNumber,
  storeId,
  title,
  description: "bank",
  price,
  originalPrice: 20,
  currency: "EUR",
  condition: "Goed",
  reason: "",
  image: undefined,
  articleNumber: "12345678",
});

const NL = { userId: 1, countries: ["nl"] };

test("sync reports only new offers and deactivates vanished ones", () => {
  const db = openDb(":memory:");
  upsertStores(db, [{ storeId: "088", name: "Amsterdam" }], "nl");
  const first = [offer("1", "KALLAX"), offer("2", "MALM")];

  expect(syncStoreOffers(db, "088", first, 1000)).toHaveLength(2);

  const second = [offer("2", "MALM"), offer("3", "BILLY")];

  expect(syncStoreOffers(db, "088", second, 2000)).toHaveLength(1);

  const { items, total } = searchOffers(db, NL, {});

  expect(total).toBe(2);
  expect(items.map((o) => o.offerNumber).sort()).toEqual(["2", "3"]);
  expect(searchOffers(db, NL, { q: "billy" }).items).toHaveLength(1);
});

test("price tag compares with lowest price measured for other offers", () => {
  const db = openDb(":memory:");
  upsertStores(db, [
    { storeId: "088", name: "Amsterdam" },
    { storeId: "415", name: "Amersfoort" },
  ]);
  syncStoreOffers(db, "088", [offer("1", "KALLAX", 20)], 1000);
  syncStoreOffers(db, "415", [offer("9", "KALLAX", 30, "415")], 1000);
  const offers =
    articleInsights(db, NL, ["12345678"])["12345678"]?.offers ?? [];
  const tags = Object.fromEntries(offers.map((o) => [o.storeId, o.tag?.kind]));

  expect(tags).toEqual({ "088": "lowest", "415": "pricier" });

  // earlier-measured price stays known after an offer disappears
  syncStoreOffers(db, "088", [], 2000);
  const after = articleInsights(db, NL, ["12345678"])["12345678"];

  expect(after?.lowestEver).toBe(20);
  expect(after?.offers[0]?.tag).toEqual({ kind: "pricier", diff: 10, low: 20 });
});

test("offers are filtered by the countries of the asking user", () => {
  const db = openDb(":memory:");
  upsertStores(db, [{ storeId: "088", name: "Amsterdam" }], "nl");
  upsertStores(db, [{ storeId: "376", name: "Zaventem" }], "be");
  syncStoreOffers(db, "088", [offer("1", "KALLAX")], 1000);
  syncStoreOffers(db, "376", [offer("2", "KALLAX", 10, "376")], 1000);

  const both = { userId: 1, countries: ["nl", "be"] };

  expect(searchOffers(db, both, {}).total).toBe(2);
  expect(searchOffers(db, NL, {}).items.map((o) => o.storeId)).toEqual(["088"]);

  const countries = (
    articleInsights(db, both, ["12345678"])["12345678"]?.offers ?? []
  )
    .map((o) => o.country)
    .sort();

  expect(countries).toEqual(["be", "nl"]);
  expect(
    articleInsights(db, NL, ["12345678"])["12345678"]?.offers,
  ).toHaveLength(1);
  expect(listStores(db, NL).map((s) => s.storeId)).toEqual(["088"]);
  expect(listStores(db)).toHaveLength(2);
});

test("followed stores and trip exclusion are per user", () => {
  const db = openDb(":memory:");
  upsertStores(db, [{ storeId: "088", name: "Amsterdam" }], "nl");
  upsertStores(db, [{ storeId: "376", name: "Zaventem" }], "be");
  const alice = createUser(db, {
    email: "alice@example.nl",
    password: "password-1",
  });
  const bob = createUser(db, {
    email: "bob@example.nl",
    password: "password-2",
  });
  const ctx = (userId: number) => ({ userId, countries: ["nl", "be"] });

  setFollowed(db, alice.id, "088", true);

  expect(followersOf(db, "088")).toEqual([alice.id]);

  const flags = (userId: number) =>
    Object.fromEntries(
      listStores(db, ctx(userId)).map((s) => [
        s.storeId,
        [s.followed, s.tripExcluded],
      ]),
    );

  expect(flags(alice.id)).toEqual({
    "088": [true, false],
    "376": [false, true],
  });
  expect(flags(bob.id)).toEqual({
    "088": [false, false],
    "376": [false, true],
  });

  setTripExcluded(db, bob.id, "376", false);

  expect(flags(bob.id)["376"]).toEqual([false, false]);
  expect(flags(alice.id)["376"]).toEqual([false, true]);
  // a deactivated user no longer receives alerts
  expect(followersOf(db, "088")).toHaveLength(1);
});
