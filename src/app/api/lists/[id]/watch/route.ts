import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { ownsList, setListWatched } from "@/server/lists.ts";

const bodySchema = z.object({ watched: z.boolean().default(true) });

export const PUT = authed(async ({ db, user, params, body }) => {
  const id = Number(params["id"]);
  if (!ownsList(db, user.id, id))
    throw new HttpError(404, "Lijst niet gevonden");
  const { watched } = await body(bodySchema);
  setListWatched(db, user.id, id, watched, Date.now());
  return ok;
});
