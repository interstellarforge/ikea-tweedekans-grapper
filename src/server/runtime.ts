import { LoginLimiter } from "./auth.ts";
import { config } from "./config.ts";
import { type Db, openDb } from "./db.ts";
import { startPolling } from "./poller.ts";
import { deriveKey } from "./secrets.ts";
import { purgeAccessLog } from "./stats.ts";
import { countUsers, createUser } from "./users.ts";

type Runtime = {
  db: Db;
  secret: Buffer;
  limiter: LoginLimiter;
  stopPolling: (() => void) | undefined;
  purgeTimer: NodeJS.Timeout | undefined;
};

const PURGE_INTERVAL_MS = 3_600_000;

// Next.js may evaluate route modules in separate module graphs; a global keeps one DB handle.
const holder = globalThis as { __tweedekanshoek?: Runtime };

function create(): Runtime {
  const db = openDb(config.dbPath);
  // Upgrade path from the single-user version: ADMIN_EMAIL + AUTH_PASSWORD become the admin
  // account and adopt the existing data. Otherwise the first registered account is the admin.
  const legacyPassword = process.env["AUTH_PASSWORD"] ?? "";
  if (countUsers(db) === 0 && config.adminEmail && legacyPassword.length >= 8) {
    createUser(db, { email: config.adminEmail, password: legacyPassword });
    console.log(`[auth] admin account created for ${config.adminEmail}`);
  }
  return {
    db,
    secret: deriveKey("session"),
    limiter: new LoginLimiter(),
    stopPolling: undefined,
    purgeTimer: undefined,
  };
}

export function runtime(): Runtime {
  holder.__tweedekanshoek ??= create();
  return holder.__tweedekanshoek;
}

/** Starts the background fetcher once per process (called from instrumentation). */
export function startBackgroundJobs(): void {
  const rt = runtime();
  rt.stopPolling ??= startPolling(rt.db);
  rt.purgeTimer ??= (() => {
    purgeAccessLog(rt.db);
    return setInterval(() => {
      purgeAccessLog(rt.db);
    }, PURGE_INTERVAL_MS).unref();
  })();
}
