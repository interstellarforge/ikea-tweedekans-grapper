import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { articleInsights } from "@/server/db.ts";
import { nonEmpty } from "@/server/strings.ts";
import { addWatchItem, listWatchItems } from "@/server/watchlist.ts";

const bodySchema = z.object({
  articleNumber: z.string().regex(/^\d{8}$/),
  name: z.string().default(""),
  typeName: z.string().default(""),
  measure: z.string().default(""),
  image: z.string().optional(),
  url: z.string().optional(),
});

export const GET = authed(({ db, user, ctx }) => {
  const items = listWatchItems(db, user.id, ctx.countries);
  const insights = articleInsights(
    db,
    ctx,
    items.map((i) => i.articleNumber),
  );
  return items.map((i) => ({ ...i, insight: insights[i.articleNumber] }));
});

export const PUT = authed(async ({ db, user, body }) => {
  let item;
  try {
    item = await body(bodySchema);
  } catch {
    throw new HttpError(400, "invalid articleNumber");
  }
  addWatchItem(
    db,
    user.id,
    {
      articleNumber: item.articleNumber,
      name: item.name,
      typeName: item.typeName,
      measure: item.measure,
      image: nonEmpty(item.image),
      url: nonEmpty(item.url),
    },
    Date.now(),
  );
  return ok;
});
