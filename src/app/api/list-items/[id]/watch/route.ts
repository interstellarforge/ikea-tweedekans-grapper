import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { ownsItem, setItemWatched } from "@/server/lists.ts";

const bodySchema = z.object({ watched: z.boolean().default(true) });

export const PUT = authed(async ({ db, user, params, body }) => {
  const id = Number(params["id"]);
  if (!ownsItem(db, user.id, id))
    throw new HttpError(404, "Item niet gevonden");
  const { watched } = await body(bodySchema);
  setItemWatched(db, user.id, id, watched, Date.now());
  return ok;
});
