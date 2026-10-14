import { expect, test } from "vitest";

import { parseShoppingList } from "./shopping-list.ts";

test("parses pasted shopping lists", () => {
  const text = [
    "2x 802.045.62 METOD wandkast",
    "METOD bovenkast 90591705 x3",
    "KALLAX 1234567",
    "10557036 - SEKTION, 4 stuks",
    "802 045 62",
    "geen artikelnummer hier",
  ].join("\n");
  expect(parseShoppingList(text)).toEqual([
    { articleNumber: "80204562", quantity: 3 }, // 2x + 1 (duplicate summed)
    { articleNumber: "90591705", quantity: 3 },
    { articleNumber: "10557036", quantity: 4 },
  ]);
});
