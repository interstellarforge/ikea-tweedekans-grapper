import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { startPolling } from "./poller.ts";
import { deriveKey } from "./secrets.ts";
import { createApp } from "./server.ts";
import { countUsers, createUser } from "./users.ts";

const db = openDb(config.dbPath);

// Upgrade path from the single-user version: when ADMIN_EMAIL is set and no accounts exist yet,
// the old password (stored hash is not reusable; AUTH_PASSWORD env) becomes the admin account and
// adopts the existing data. Otherwise the first registered account becomes the admin.
const legacyPassword = process.env["AUTH_PASSWORD"] ?? "";
if (countUsers(db) === 0 && config.adminEmail && legacyPassword.length >= 8) {
  createUser(db, { email: config.adminEmail, password: legacyPassword });
  console.log(`[auth] admin account created for ${config.adminEmail}`);
}

const stopPolling = startPolling(db);
const server = createApp(db, deriveKey("session")).listen(
  config.port,
  config.host,
  () => {
    console.log(`listening on http://${config.host}:${String(config.port)}`);
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopPolling();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
