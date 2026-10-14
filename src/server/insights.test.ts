import { expect, test } from "vitest";

import { priceTag } from "./insights.ts";

test("priceTag compares to lowest earlier price", () => {
  expect(priceTag(10, undefined)).toBeUndefined();
  expect(priceTag(10, 12)).toEqual({ kind: "lowest", diff: 0, low: 12 });
  expect(priceTag(12, 12)).toEqual({ kind: "equal", diff: 0, low: 12 });
  expect(priceTag(14.5, 12)).toEqual({ kind: "pricier", diff: 2.5, low: 12 });
});
