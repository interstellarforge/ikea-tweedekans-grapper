import { expect, test } from "vitest";

process.env["SECRET_KEY"] = "ab".repeat(32);

import { openDb } from "./db.ts";
import {
  getGlobalSettings,
  getUserSettings,
  saveGlobalSettings,
  saveUserSettings,
  toPublicGlobal,
  toPublicUser,
} from "./settings.ts";

test("smtp password (admin) is encrypted, kept on empty update and never exposed", () => {
  const db = openDb(":memory:");

  expect(
    saveGlobalSettings(db, {
      smtp: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: "x@gmail.com",
        password: "abcd efgh",
      },
    }),
  ).toBeUndefined();
  // Google app passwords are shown in groups; the spaces are dropped for gmail
  expect(getGlobalSettings(db).smtp.password).toBe("abcdefgh");
  expect(saveGlobalSettings(db, { smtp: { password: "" } })).toBeUndefined();
  expect(getGlobalSettings(db).smtp.password).toBe("abcdefgh");

  const raw = db
    .prepare("SELECT value FROM settings WHERE key = 'email.password'")
    .get() as {
    value: string;
  };

  expect(raw.value).not.toContain("abcdefgh");
  expect(toPublicGlobal(getGlobalSettings(db)).smtp).not.toHaveProperty(
    "password",
  );
  expect(toPublicGlobal(getGlobalSettings(db)).smtp.passwordSet).toBe(true);
  expect(saveGlobalSettings(db, { pollIntervalMin: 1 })).toMatch(/Interval/);
});

test("admin controls which notification types exist", () => {
  const db = openDb(":memory:");

  expect(getGlobalSettings(db).channels).toEqual({
    ntfy: true,
    email: true,
    homeAssistant: true,
    app: true,
  });

  saveGlobalSettings(db, { channels: { email: false } });

  expect(getGlobalSettings(db).channels).toEqual({
    ntfy: true,
    email: false,
    homeAssistant: true,
    app: true,
  });
  expect(getGlobalSettings(db).registrationOpen).toBe(true);

  saveGlobalSettings(db, { registrationOpen: false });

  expect(getGlobalSettings(db).registrationOpen).toBe(false);
});

test("user settings are validated, per user, and secrets are not exposed", () => {
  const db = openDb(":memory:");

  expect(getUserSettings(db, 1)).toMatchObject({
    countries: ["nl"],
    fuelPrice: 2.1,
    maxStops: 3,
  });
  expect(
    saveUserSettings(db, 1, {
      homePostcode: "6921 rm",
      fuelPrice: 1.85,
      maxStops: 5,
    }),
  ).toBeUndefined();
  expect(getUserSettings(db, 1)).toMatchObject({
    homePostcode: "6921RM",
    fuelPrice: 1.85,
    maxStops: 5,
  });
  expect(getUserSettings(db, 2).homePostcode).toBe("");

  expect(saveUserSettings(db, 1, { homePostcode: "nope" })).toMatch(/Postcode/);
  expect(saveUserSettings(db, 1, { maxStops: 9 })).toMatch(/1 en 8/);
  expect(saveUserSettings(db, 1, { countries: [] })).toMatch(
    /minstens één land/,
  );
  expect(saveUserSettings(db, 1, { countries: ["fr"] })).toMatch(
    /minstens één land/,
  );

  expect(
    saveUserSettings(db, 1, {
      notify: { homeAssistant: true },
      homeAssistant: {
        baseUrl: "http://ha.local:8123/",
        token: "tok",
        targets: ["mobile_app_x"],
      },
    }),
  ).toBeUndefined();

  const s = getUserSettings(db, 1);

  expect(s.homeAssistant).toMatchObject({
    baseUrl: "http://ha.local:8123",
    token: "tok",
  });
  expect(s.notify.homeAssistant).toBe(true);

  const raw = db
    .prepare(
      "SELECT value FROM user_settings WHERE user_id = 1 AND key = 'ha.token'",
    )
    .get() as { value: string };

  expect(raw.value).not.toContain("tok");
  expect(toPublicUser(s).homeAssistant).not.toHaveProperty("token");
  expect(
    saveUserSettings(db, 1, { homeAssistant: { token: "" } }),
  ).toBeUndefined();
  expect(getUserSettings(db, 1).homeAssistant.token).toBe("tok");
});
