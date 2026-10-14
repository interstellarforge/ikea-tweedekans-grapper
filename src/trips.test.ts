import { expect, test } from "vitest";

import { evaluateTrip, findBestRoute, normalizePostcode } from "./trips.ts";

test("trip is worth it when savings exceed fuel cost", () => {
  const base = {
    fuelPrice: 2,
    consumptionPer100km: 7,
    items: [
      {
        articleNumber: "1",
        name: "KALLAX",
        quantity: 2,
        offers: [
          { price: 20, originalPrice: 40 },
          { price: 25, originalPrice: 40 },
          { price: 30, originalPrice: 40 },
        ],
      },
    ],
  };
  // 100 km one way -> 200 km x 0.07 l/km x EUR 2 = EUR 28 fuel; saving (20 + 15) = 35
  const far = evaluateTrip({ ...base, distanceKm: 100 });
  expect(far).toMatchObject({
    tripCost: 28,
    saving: 35,
    net: 7,
    worthIt: true,
  });
  expect(far.items[0]).toMatchObject({ wanted: 2, found: 2, spend: 45 });
  // 200 km one way -> EUR 56 fuel: not worth it
  expect(evaluateTrip({ ...base, distanceKm: 200 }).worthIt).toBe(false);
  // nothing available -> never worth it
  expect(
    evaluateTrip({
      ...base,
      distanceKm: 1,
      items: [{ articleNumber: "1", name: "KALLAX", quantity: 1, offers: [] }],
    }).worthIt,
  ).toBe(false);
});

test("postcode normalisation", () => {
  expect(normalizePostcode(" 6921 rm ")).toBe("6921RM");
  expect(normalizePostcode("0123AB")).toBeUndefined();
});

test("combined route never buys more than the wanted quantity", () => {
  const offers = [
    // wanted 1x item 1: available in A (EUR 10, saves 30) and B (EUR 15, saves 25)
    { storeId: "A", articleNumber: "1", price: 10, originalPrice: 40 },
    { storeId: "B", articleNumber: "1", price: 15, originalPrice: 40 },
    // wanted 1x item 2: only in B (saves 50)
    { storeId: "B", articleNumber: "2", price: 50, originalPrice: 100 },
  ];
  const wants = [
    { articleNumber: "1", name: "X", quantity: 1 },
    { articleNumber: "2", name: "Y", quantity: 1 },
  ];
  const base = { fuelPrice: 1, consumptionPer100km: 10, wants, offers };
  const dist: Record<string, number> = { A: 10, B: 10 };
  const { best, bestSingle } = findBestRoute({
    ...base,
    storeIds: ["A", "B"],
    maxStops: 2,
    homeKm: (id) => dist[id] ?? 999,
    betweenKm: () => 5,
  });
  // B alone: saves 25 + 50 = 75, cost 20 km x 0.1 = 2 -> net 73
  expect(bestSingle?.stops.map((s) => s.storeId)).toEqual(["B"]);
  expect(bestSingle?.net).toBe(73);
  // A + B: buy item 1 in A (saves 30) and item 2 in B (50) = 80, 25 km x 0.1 = 2.5 -> 77.5
  expect(best?.stops.map((s) => s.storeId).sort()).toEqual(["A", "B"]);
  expect(best?.net).toBe(77.5);
  const units = best?.stops.flatMap((s) => s.units.map((u) => u.count)) ?? [];
  expect(units.reduce((a, b) => a + b, 0)).toBe(2); // exactly 1 + 1, no duplicates
});
