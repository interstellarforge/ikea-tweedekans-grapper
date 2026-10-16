import { randomBytes } from "node:crypto";

import { hashPassword, verifyPassword } from "./auth.ts";
import type { Db } from "./db.ts";

export type Role = "user" | "admin";

export type User = {
  id: number;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
  lastLogin: number | undefined;
  /** Secret part of the personal ntfy topic. */
  ntfyToken: string;
};

type UserRow = {
  id: number;
  email: string;
  role: string;
  active: number;
  created_at: number;
  last_login: number | null;
  ntfy_token: string;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  role: r.role === "admin" ? "admin" : "user",
  active: r.active === 1,
  createdAt: r.created_at,
  lastLogin: r.last_login ?? undefined,
  ntfyToken: r.ntfy_token,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export const isValidEmail = (email: string): boolean =>
  email.length <= 200 && EMAIL_RE.test(email);

export function countUsers(db: Db): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number })
    .n;
}

export function getUserById(db: Db, id: number): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    UserRow | undefined;
  return row && toUser(row);
}

export function getUserByEmail(
  db: Db,
  email: string,
): (User & { passwordHash: string }) | undefined {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as
    (UserRow & { password_hash: string }) | undefined;
  return row && { ...toUser(row), passwordHash: row.password_hash };
}

/** Password hash of a user, used to bind sessions to the current password. */
export function getPasswordHash(db: Db, id: number): string | undefined {
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(id) as { password_hash: string } | undefined;
  return row?.password_hash;
}

export function listUsers(db: Db): User[] {
  return (
    db.prepare("SELECT * FROM users ORDER BY created_at, id").all() as UserRow[]
  ).map(toUser);
}

/** Moves data created before multi-user support (user 0) to this user. */
function adoptLegacyData(db: Db, userId: number): void {
  for (const table of [
    "watch_items",
    "alerts",
    "lists",
    "user_stores",
    "user_settings",
  ]) {
    db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = 0`).run(userId);
  }
}

export function createUser(
  db: Db,
  input: { email: string; password: string; role?: Role },
  now = Date.now(),
): User {
  const email = normalizeEmail(input.email);
  const first = countUsers(db) === 0;
  const role: Role = first ? "admin" : (input.role ?? "user");
  const res = db
    .prepare(
      `INSERT INTO users (email, password_hash, role, active, created_at, ntfy_token)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(
      email,
      hashPassword(input.password),
      role,
      now,
      randomBytes(16).toString("hex"),
    );
  const id = Number(res.lastInsertRowid);
  if (first) adoptLegacyData(db, id);
  const user = getUserById(db, id);
  if (!user) throw new Error("user was not created");
  return user;
}

export function checkLogin(
  db: Db,
  email: string,
  password: string,
): User | undefined {
  const row = getUserByEmail(db, email);
  // Always run a hash comparison so timing does not reveal whether the account exists.
  const ok = verifyPassword(
    password,
    row?.passwordHash ?? "scrypt:AAAAAAAAAAAAAAAAAAAAAA==:AAAA",
  );
  if (!row || !ok || !row.active) return undefined;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt,
    lastLogin: row.lastLogin,
    ntfyToken: row.ntfyToken,
  };
}

export function touchLogin(db: Db, id: number, now: number): void {
  db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(now, id);
}

export function setPassword(db: Db, id: number, password: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(password),
    id,
  );
  // Device tokens are not bound to the password; a password change signs every device out.
  db.prepare("DELETE FROM device_tokens WHERE user_id = ?").run(id);
}

function adminCount(db: Db): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1",
      )
      .get() as { n: number }
  ).n;
}

/** Returns an error message when the change would leave the app without an active admin. */
export function updateUser(
  db: Db,
  id: number,
  changes: { role?: Role; active?: boolean },
): string | undefined {
  const user = getUserById(db, id);
  if (!user) return "Gebruiker niet gevonden";
  const nextRole = changes.role ?? user.role;
  const nextActive = changes.active ?? user.active;
  const loses = user.role === "admin" && user.active;
  const keeps = nextRole === "admin" && nextActive;
  if (loses && !keeps && adminCount(db) <= 1) {
    return "Er moet minimaal één actieve beheerder blijven";
  }
  db.prepare("UPDATE users SET role = ?, active = ? WHERE id = ?").run(
    nextRole,
    nextActive ? 1 : 0,
    id,
  );
  return undefined;
}

export function deleteUser(db: Db, id: number): string | undefined {
  const user = getUserById(db, id);
  if (!user) return "Gebruiker niet gevonden";
  if (user.role === "admin" && user.active && adminCount(db) <= 1) {
    return "Er moet minimaal één actieve beheerder blijven";
  }
  db.exec("BEGIN");
  try {
    db.prepare(
      `DELETE FROM purchases WHERE list_item_id IN
         (SELECT li.id FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.user_id = ?)`,
    ).run(id);
    db.prepare(
      "DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id = ?)",
    ).run(id);
    for (const table of [
      "lists",
      "watch_items",
      "alerts",
      "user_stores",
      "user_settings",
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return undefined;
}

const SEEN_THROTTLE_MS = 60_000;

/** Last activity and IP of a user; written at most once a minute. */
export function touchSeen(
  db: Db,
  id: number,
  ip: string,
  now = Date.now(),
): void {
  db.prepare(
    `UPDATE users SET last_seen = ?, last_ip = ?
      WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)`,
  ).run(now, ip, id, now - SEEN_THROTTLE_MS);
}
