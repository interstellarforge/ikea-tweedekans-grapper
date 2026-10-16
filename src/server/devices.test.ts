import { expect, test } from "vitest";

import { openDb } from "./db.ts";
import {
  authenticateDevice,
  createDevice,
  listDevices,
  pushTokensOf,
  revokeDevice,
  setPushToken,
} from "./devices.ts";
import { createUser, setPassword } from "./users.ts";

test("devices: tokens authenticate their own user only, revoke and password change sign out", () => {
  const db = openDb(":memory:");
  const a = createUser(db, { email: "a@example.com", password: "password-a" });
  const b = createUser(db, { email: "b@example.com", password: "password-b" });
  const device = createDevice(db, a.id, "Pixel");

  expect(authenticateDevice(db, device.token)?.user.id).toBe(a.id);
  expect(authenticateDevice(db, "not-a-token")).toBeUndefined();

  // Another user can neither see nor revoke the device.
  expect(listDevices(db, b.id)).toHaveLength(0);
  expect(revokeDevice(db, b.id, device.id)).toBe(false);
  expect(authenticateDevice(db, device.token)).toBeDefined();

  setPushToken(db, a.id, device.id, "fcm-token");

  expect(pushTokensOf(db, a.id)).toEqual(["fcm-token"]);

  setPassword(db, a.id, "new-password-a");

  expect(authenticateDevice(db, device.token)).toBeUndefined();
});
