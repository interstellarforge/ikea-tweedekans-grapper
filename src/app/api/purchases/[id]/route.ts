import { authed, HttpError, ok } from "@/server/api.ts";
import { ownsPurchase, undoPurchase } from "@/server/lists.ts";

export const DELETE = authed(({ db, user, params }) => {
  const id = Number(params["id"]);
  if (!ownsPurchase(db, user.id, id)) {
    throw new HttpError(404, "Aankoop niet gevonden");
  }
  undoPurchase(db, id);
  return ok;
});
