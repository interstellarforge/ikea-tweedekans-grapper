import { authed, HttpError, ok } from "@/server/api.ts";
import { revokeDevice } from "@/server/devices.ts";

/** Signs the calling device out (revokes its token). */
export const POST = authed(({ db, user, deviceId }) => {
  if (deviceId === undefined) throw new HttpError(400, "Alleen voor de app");
  revokeDevice(db, user.id, deviceId);
  return ok;
});
