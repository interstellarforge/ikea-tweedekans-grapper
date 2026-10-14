import { z } from "zod";

import { authed, HttpError } from "@/server/api.ts";
import { ownsItem, recordPieces } from "@/server/lists.ts";
import { nonEmpty } from "@/server/strings.ts";

const bodySchema = z.object({
  pieces: z.array(z.unknown()).default([]),
  storeName: z.string().optional(),
});

export const POST = authed(async ({ db, user, params, body }) => {
  const id = Number(params["id"]);
  if (!ownsItem(db, user.id, id))
    throw new HttpError(404, "Item niet gevonden");
  const { pieces, storeName } = await body(bodySchema);
  const prices = pieces.map((p) => (typeof p === "number" ? p : undefined));
  return {
    recorded: recordPieces(db, id, prices, nonEmpty(storeName), Date.now()),
  };
});
