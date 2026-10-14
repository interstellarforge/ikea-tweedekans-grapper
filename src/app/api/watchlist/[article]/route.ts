import { authed, ok } from "@/server/api.ts";
import { removeWatchItem } from "@/server/watchlist.ts";

export const DELETE = authed(({ db, user, params }) => {
  removeWatchItem(db, user.id, params["article"] ?? "");
  return ok;
});
