import { z } from "zod";

import { authed } from "@/server/api.ts";
import { parseShoppingList } from "@/server/shopping-list.ts";

const MAX_ITEMS = 200;
const bodySchema = z.object({ text: z.string().default("") });

export const POST = authed(async ({ body }) => {
  const { text } = await body(bodySchema);
  return { items: parseShoppingList(text).slice(0, MAX_ITEMS) };
});
