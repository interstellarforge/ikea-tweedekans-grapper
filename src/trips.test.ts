import { expect, test } from "vitest";

import { evaluateTrip, normalizePostcode } from "./trips.ts";

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
