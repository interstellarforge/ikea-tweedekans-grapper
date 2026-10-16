import { authed } from "@/server/api.ts";
import { listDevices } from "@/server/devices.ts";

export const GET = authed(({ db, user, deviceId }) => ({
  current: deviceId,
  devices: listDevices(db, user.id),
}));
