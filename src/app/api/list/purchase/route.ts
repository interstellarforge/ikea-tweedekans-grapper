import { z } from "zod";

import { authed, ok } from "@/server/api.ts";
import { purchaseByArticle } from "@/server/lists.ts";
import { nonEmpty } from "@/server/strings.ts";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        articleNumber: z.string(),
        count: z.number(),
        unitPrice: z.number().optional(),
        storeName: z.string().optional(),
      }),
    )
    .default([]),
});

// From the trip check: tick pieces off on the lists, at the price of that offer.
export const POST = authed(async ({ db, user, body }) => {
  const { items } = await body(bodySchema);
  purchaseByArticle(
    db,
    user.id,
    items.map((i) => ({
      articleNumber: i.articleNumber,
      count: i.count,
      unitPrice: i.unitPrice,
      storeName: nonEmpty(i.storeName),
    })),
    Date.now(),
  );
  return ok;
});
