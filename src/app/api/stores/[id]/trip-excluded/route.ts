import { z } from "zod";

import { authed, ok } from "@/server/api.ts";
import { setTripExcluded } from "@/server/db.ts";

const bodySchema = z.object({ excluded: z.boolean().default(false) });

export const PUT = authed(async ({ db, user, params, body }) => {
  const { excluded } = await body(bodySchema);
  setTripExcluded(db, user.id, params["id"] ?? "", excluded);
  return ok;
});
