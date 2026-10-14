import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { setBought } from "@/server/watchlist.ts";

const bodySchema = z.object({ bought: z.number().min(0) });

export const PUT = authed(async ({ db, user, params, body }) => {
  let bought;
  try {
    ({ bought } = await body(bodySchema));
  } catch {
    throw new HttpError(400, "bought must be a number >= 0");
  }
  setBought(db, user.id, params["article"] ?? "", bought);
  return ok;
});
