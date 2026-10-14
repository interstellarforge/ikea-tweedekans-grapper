import { z } from "zod";

import { authed, ok } from "@/server/api.ts";
import { setFollowed } from "@/server/db.ts";

const bodySchema = z.object({ followed: z.boolean().default(false) });

export const PUT = authed(async ({ db, user, params, body }) => {
  const { followed } = await body(bodySchema);
  setFollowed(db, user.id, params["id"] ?? "", followed);
  return ok;
});
