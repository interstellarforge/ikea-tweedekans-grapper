import { authed, ok } from "@/server/api.ts";
import { markAlertsSeen } from "@/server/watchlist.ts";

export const POST = authed(({ db, user }) => {
  markAlertsSeen(db, user.id);
  return ok;
});
