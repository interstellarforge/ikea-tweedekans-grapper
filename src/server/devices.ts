import { createHash, randomBytes } from "node:crypto";

import type { Db } from "./db.ts";
import { getUserById, type User } from "./users.ts";

export type Device = {
  id: number;
  name: string;
  createdAt: number;
  lastUsed: number | undefined;
  /** Whether this device registered for push notifications. */
  pushEnabled: boolean;
};

type DeviceRow = {
  id: number;
  name: string;
  created_at: number;
  last_used: number | null;
  push_token: string | null;
};

const TOKEN_BYTES = 32;
const LAST_USED_GRANULARITY_MS = 60_000;
const MAX_NAME = 60;

export function ensureDeviceSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used INTEGER,
      push_token TEXT
    );
    CREATE INDEX IF NOT EXISTS device_tokens_user ON device_tokens (user_id);
  `);
}

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Creates a device token. Only its hash is stored; the plain token is returned once. */
export function createDevice(
  db: Db,
  userId: number,
  name: string,
  now = Date.now(),
): { id: number; token: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const result = db
    .prepare(
      "INSERT INTO device_tokens (user_id, token_hash, name, created_at, last_used) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      userId,
      hashToken(token),
      name.trim().slice(0, MAX_NAME) || "Android",
      now,
      now,
    );
  return { id: Number(result.lastInsertRowid), token };
}

/** The active user and device behind a bearer token, if the token is known. */
export function authenticateDevice(
  db: Db,
  token: string,
  now = Date.now(),
): { user: User; deviceId: number } | undefined {
  const row = db
    .prepare(
      "SELECT id, user_id AS userId, last_used AS lastUsed FROM device_tokens WHERE token_hash = ?",
    )
    .get(hashToken(token)) as
    { id: number; userId: number; lastUsed: number | null } | undefined;
  if (!row) return undefined;
  const user = getUserById(db, row.userId);
  if (!user?.active) return undefined;
  if ((row.lastUsed ?? 0) < now - LAST_USED_GRANULARITY_MS) {
    db.prepare("UPDATE device_tokens SET last_used = ? WHERE id = ?").run(
      now,
      row.id,
    );
  }
  return { user, deviceId: row.id };
}

export function listDevices(db: Db, userId: number): Device[] {
  return (
    db
      .prepare(
        "SELECT id, name, created_at, last_used, push_token FROM device_tokens WHERE user_id = ? ORDER BY created_at DESC",
      )
      .all(userId) as DeviceRow[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    lastUsed: r.last_used ?? undefined,
    pushEnabled: r.push_token !== null,
  }));
}

export function revokeDevice(
  db: Db,
  userId: number,
  deviceId: number,
): boolean {
  return (
    db
      .prepare("DELETE FROM device_tokens WHERE id = ? AND user_id = ?")
      .run(deviceId, userId).changes > 0
  );
}

export function revokeAllDevices(db: Db, userId: number): void {
  db.prepare("DELETE FROM device_tokens WHERE user_id = ?").run(userId);
}

export function setPushToken(
  db: Db,
  userId: number,
  deviceId: number,
  pushToken: string | undefined,
): void {
  db.prepare(
    "UPDATE device_tokens SET push_token = ? WHERE id = ? AND user_id = ?",
  ).run(pushToken ?? null, deviceId, userId);
}

export function pushTokensOf(db: Db, userId: number): string[] {
  return (
    db
      .prepare(
        "SELECT push_token AS token FROM device_tokens WHERE user_id = ? AND push_token IS NOT NULL",
      )
      .all(userId) as { token: string }[]
  ).map((r) => r.token);
}

/** FCM reported the token as dead; forget it so we stop sending. */
export function dropPushToken(db: Db, pushToken: string): void {
  db.prepare(
    "UPDATE device_tokens SET push_token = NULL WHERE push_token = ?",
  ).run(pushToken);
}
