import { expect, test } from "vitest";

import {
  articleInsights,
  openDb,
  searchOffers,
  syncStoreOffers,
  upsertStores,
} from "./db.ts";
import type { IkeaOffer } from "./ikea-client.ts";

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

test("sync reports only new offers and deactivates vanished ones", () => {
  const db = openDb(":memory:");
  upsertStores(db, [{ storeId: "088", name: "Amsterdam" }]);
  const first = [offer("1", "KALLAX"), offer("2", "MALM")];
  expect(syncStoreOffers(db, "088", first, 1000)).toHaveLength(2);
  const second = [offer("2", "MALM"), offer("3", "BILLY")];
  expect(syncStoreOffers(db, "088", second, 2000)).toHaveLength(1);
  const { items, total } = searchOffers(db, {});
  expect(total).toBe(2);
  expect(items.map((o) => o.offerNumber).sort()).toEqual(["2", "3"]);
  expect(searchOffers(db, { q: "billy" }).items).toHaveLength(1);
});

test("price tag compares with lowest price measured for other offers", () => {
  const db = openDb(":memory:");
  upsertStores(db, [
    { storeId: "088", name: "Amsterdam" },
    { storeId: "415", name: "Amersfoort" },
  ]);
  syncStoreOffers(db, "088", [offer("1", "KALLAX", 20)], 1000);
  syncStoreOffers(db, "415", [offer("9", "KALLAX", 30, "415")], 1000);
  const offers = articleInsights(db, ["12345678"])["12345678"]?.offers ?? [];
  const tags = Object.fromEntries(offers.map((o) => [o.storeId, o.tag?.kind]));
  expect(tags).toEqual({ "088": "lowest", "415": "pricier" });
  // earlier-measured price stays known after an offer disappears
  syncStoreOffers(db, "088", [], 2000);
  const after = articleInsights(db, ["12345678"])["12345678"];
  expect(after?.lowestEver).toBe(20);
  expect(after?.offers[0]?.tag).toEqual({ kind: "pricier", diff: 10, low: 20 });
});
