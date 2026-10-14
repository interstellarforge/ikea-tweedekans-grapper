import { expect, test } from "vitest";

process.env["SECRET_KEY"] = "ab".repeat(32);

import { openDb } from "./db.ts";
import { getSettings, saveSettings, toPublic } from "./settings.ts";

test("smtp password is stored, kept on empty update and never exposed", () => {
  const db = openDb(":memory:");
  expect(
    saveSettings(db, {
      email: {
        host: "smtp.gmail.com",
        port: 465,
        password: "secret",
        to: "a@b.nl",
      },
    }),
  ).toBeUndefined();
  expect(
    saveSettings(db, { email: { password: "", enabled: true } }),
  ).toBeUndefined();
  expect(getSettings(db).email.password).toBe("secret");
  const raw = db
    .prepare("SELECT value FROM settings WHERE key = 'email.password'")
    .get() as { value: string };
  expect(raw.value).not.toContain("secret");
  const pub = toPublic(getSettings(db));
  expect(pub.email).not.toHaveProperty("password");
  expect(pub.email.passwordSet).toBe(true);
  expect(saveSettings(db, { email: { to: "not-an-address" } })).toMatch(
    /Ongeldig/,
  );
  // Home Assistant token is encrypted too and never exposed
  expect(
    saveSettings(db, {
      homeAssistant: {
        baseUrl: "http://ha.local:8123/",
        token: "tok",
        targets: ["mobile_app_x"],
      },
    }),
  ).toBeUndefined();
  expect(getSettings(db).homeAssistant).toMatchObject({
    baseUrl: "http://ha.local:8123",
    token: "tok",
    targets: ["mobile_app_x"],
  });
  const ha = db
    .prepare("SELECT value FROM settings WHERE key = 'ha.token'")
    .get() as { value: string };
  expect(ha.value).not.toContain("tok");
  expect(toPublic(getSettings(db)).homeAssistant).not.toHaveProperty("token");
  expect(
    saveSettings(db, { homeAssistant: { targets: ["bad name!"] } }),
  ).toMatch(/Ongeldige/);
});
