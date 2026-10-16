import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { setPushToken } from "@/server/devices.ts";

const bodySchema = z.object({ pushToken: z.string().min(1).nullable() });

/** The app registers (or clears) its FCM token for this device. */
export const PUT = authed(async ({ db, user, deviceId, body }) => {
  if (deviceId === undefined) throw new HttpError(400, "Alleen voor de app");
  const { pushToken } = await body(bodySchema);
  setPushToken(db, user.id, deviceId, pushToken ?? undefined);
  return ok;
});
