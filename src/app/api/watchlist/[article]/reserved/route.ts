import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { collectReserved } from "@/server/lists.ts";
import { setReserved } from "@/server/watchlist.ts";

const bodySchema = z.object({ reserved: z.number().min(0) });

export const PUT = authed(async ({ db, user, params, body }) => {
  let reserved;
  try {
    ({ reserved } = await body(bodySchema));
  } catch {
    throw new HttpError(400, "reserved must be a number >= 0");
  }
  setReserved(db, user.id, params["article"] ?? "", reserved);
  return ok;
});

// Reserved pieces were picked up: count them as bought.
export const POST = authed(({ db, user, params }) => {
  collectReserved(db, user.id, params["article"] ?? "", Date.now());
  return ok;
});
