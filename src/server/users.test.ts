import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { openDb } from "./db.ts";
import { addListItem, createList, getLists } from "./lists.ts";
import { getUserSettings, saveUserSettings } from "./settings.ts";
import {
  checkLogin,
  createUser,
  deleteUser,
  getUserByEmail,
  listUsers,
  setPassword,
  updateUser,
} from "./users.ts";
import { addWatchItem, listWatchItems } from "./watchlist.ts";

const product = (articleNumber: string) => ({
  articleNumber,
  name: "KOMPLEMENT",
  typeName: "Plank",
  measure: "",
  image: undefined,
  url: undefined,
  normalPrice: undefined,
});

test("accounts: first one is admin, login works, emails are unique and case-insensitive", () => {
  const db = openDb(":memory:");
  const first = createUser(db, {
    email: "Admin@Example.NL",
    password: "password-1",
  });
  const second = createUser(db, {
    email: "kees@example.nl",
    password: "password-2",
  });
  expect(first.role).toBe("admin");
  expect(second.role).toBe("user");
  expect(first.email).toBe("admin@example.nl");
  expect(first.ntfyToken).not.toBe(second.ntfyToken);
  expect(first.ntfyToken).toMatch(/^[0-9a-f]{32}$/);

  expect(checkLogin(db, "ADMIN@example.nl", "password-1")?.id).toBe(first.id);
  expect(checkLogin(db, "admin@example.nl", "nope")).toBeUndefined();
  expect(checkLogin(db, "who@example.nl", "password-1")).toBeUndefined();
  expect(() =>
    createUser(db, { email: "kees@EXAMPLE.nl", password: "password-3" }),
  ).toThrow();

  setPassword(db, second.id, "new-password-9");
  expect(checkLogin(db, "kees@example.nl", "password-2")).toBeUndefined();
  expect(checkLogin(db, "kees@example.nl", "new-password-9")?.id).toBe(
    second.id,
  );

  // deactivated accounts cannot log in
  expect(updateUser(db, second.id, { active: false })).toBeUndefined();
  expect(checkLogin(db, "kees@example.nl", "new-password-9")).toBeUndefined();
  expect(getUserByEmail(db, "kees@example.nl")?.active).toBe(false);
});

test("the last active admin cannot be demoted, deactivated or deleted", () => {
  const db = openDb(":memory:");
  const admin = createUser(db, {
    email: "a@example.nl",
    password: "password-1",
  });
  const user = createUser(db, {
    email: "b@example.nl",
    password: "password-2",
  });
  expect(updateUser(db, admin.id, { role: "user" })).toMatch(/beheerder/);
  expect(updateUser(db, admin.id, { active: false })).toMatch(/beheerder/);
  expect(deleteUser(db, admin.id)).toMatch(/beheerder/);

  expect(updateUser(db, user.id, { role: "admin" })).toBeUndefined();
  expect(updateUser(db, admin.id, { role: "user" })).toBeUndefined();
  expect(listUsers(db).map((u) => u.role)).toEqual(["user", "admin"]);
});

test("users only see their own data and deleting a user removes it", () => {
  const db = openDb(":memory:");
  const alice = createUser(db, {
    email: "alice@example.nl",
    password: "password-1",
  });
  const bob = createUser(db, {
    email: "bob@example.nl",
    password: "password-2",
  });
  const nl = ["nl"];

  addWatchItem(db, bob.id, product("70277981"), 1);
  const bobList = createList(db, bob.id, "Keuken", 1);
  addListItem(db, bobList, product("70277981"), 2, "max", 1);
  saveUserSettings(db, bob.id, { homePostcode: "6921RM", fuelPrice: 1.9 });

  expect(listWatchItems(db, bob.id, nl)).toHaveLength(1);
  expect(listWatchItems(db, alice.id, nl)).toHaveLength(0);
  expect(getLists(db, bob.id, nl)).toHaveLength(1);
  expect(getLists(db, alice.id, nl)).toHaveLength(0);
  expect(getUserSettings(db, bob.id).homePostcode).toBe("6921RM");
  expect(getUserSettings(db, alice.id).homePostcode).toBe("");

  expect(deleteUser(db, bob.id)).toBeUndefined();
  expect(listWatchItems(db, bob.id, nl)).toHaveLength(0);
  expect(getLists(db, bob.id, nl)).toHaveLength(0);
  expect(
    db.prepare("SELECT COUNT(*) AS n FROM list_items").get(),
  ).toMatchObject({ n: 0 });
});

test("single-user data is adopted by the first account", () => {
  const dir = mkdtempSync(join(tmpdir(), "tweedekans-"));
  const path = join(dir, "t.db");
  try {
    const legacy = openDb(path);
    // data as the single-user version stored it (user_id 0)
    legacy
      .prepare(
        "INSERT INTO watch_items (user_id, article_number, name, type_name, measure, added_at, quantity, bought) VALUES (0, '90591705', 'METOD', 'kast', '', 1, 3, 0)",
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO user_settings (user_id, key, value) VALUES (0, 'homePostcode', '5708AM')",
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO user_stores (user_id, store_id, followed, trip_excluded) VALUES (0, '088', 1, 0)",
      )
      .run();
    legacy.close();

    const db = openDb(path);
    const admin = createUser(db, {
      email: "kees@example.nl",
      password: "password-1",
    });
    expect(admin.role).toBe("admin");
    expect(
      listWatchItems(db, admin.id, ["nl"]).map((w) => w.articleNumber),
    ).toEqual(["90591705"]);
    expect(getUserSettings(db, admin.id).homePostcode).toBe("5708AM");

    // a second account does not inherit anything
    const other = createUser(db, {
      email: "other@example.nl",
      password: "password-2",
    });
    expect(listWatchItems(db, other.id, ["nl"])).toHaveLength(0);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
