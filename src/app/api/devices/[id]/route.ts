import { authed, HttpError, ok } from "@/server/api.ts";
import { revokeDevice } from "@/server/devices.ts";

export const DELETE = authed(({ db, user, params }) => {
  if (!revokeDevice(db, user.id, Number(params["id"]))) {
    throw new HttpError(404, "Apparaat niet gevonden");
  }
  return ok;
});
