import { z } from "zod";

import { authed } from "@/server/api.ts";
import { refreshListPrices } from "@/server/list-prices.ts";
import { createList, getLists } from "@/server/lists.ts";

const bodySchema = z.object({ name: z.string().default("") });

export const GET = authed(({ db, user, ctx }) => {
  const lists = getLists(db, user.id, ctx.countries);
  refreshListPrices(db);
  return lists;
});

export const POST = authed(async ({ db, user, body }) => {
  const { name } = await body(bodySchema);
  return { id: createList(db, user.id, name, Date.now()) };
});
