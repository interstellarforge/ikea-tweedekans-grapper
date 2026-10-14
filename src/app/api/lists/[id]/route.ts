import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { deleteList, ownsList, renameList } from "@/server/lists.ts";

const bodySchema = z.object({ name: z.string().default("") });

export const PUT = authed(async ({ db, user, params, body }) => {
  const id = Number(params["id"]);
  if (!ownsList(db, user.id, id))
    throw new HttpError(404, "Lijst niet gevonden");
  renameList(db, id, (await body(bodySchema)).name);
  return ok;
});

export const DELETE = authed(({ db, user, params }) => {
  const id = Number(params["id"]);
  if (!ownsList(db, user.id, id))
    throw new HttpError(404, "Lijst niet gevonden");
  deleteList(db, id);
  return ok;
});
