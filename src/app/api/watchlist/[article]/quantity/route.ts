import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { setQuantity } from "@/server/watchlist.ts";

const bodySchema = z.object({ quantity: z.number().min(1) });

export const PUT = authed(async ({ db, user, params, body }) => {
  let quantity;
  try {
    ({ quantity } = await body(bodySchema));
  } catch {
    throw new HttpError(400, "quantity must be a number >= 1");
  }
  setQuantity(db, user.id, params["article"] ?? "", quantity);
  return ok;
});
