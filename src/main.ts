import { type Auth, createAuth, noAuth } from "./auth.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { startPolling } from "./poller.ts";
import { deriveKey } from "./secrets.ts";
import { createApp } from "./server.ts";

function buildAuth(): Auth {
  if (config.authDisabled) {
    console.warn("[auth] AUTH_DISABLED=true: the web UI is NOT protected");
    return noAuth;
  }
  if (config.authPassword.length < 8) {
    console.error(
      "AUTH_PASSWORD (min. 8 characters) is required. Set AUTH_DISABLED=true to run without login.",
    );
    process.exit(1);
  }
  return createAuth({
    user: config.authUser,
    password: config.authPassword,
    secret: deriveKey("session"),
  });
}

const auth = buildAuth();
const db = openDb(config.dbPath);
const stopPolling = startPolling(db);
const server = createApp(db, auth).listen(config.port, config.host, () => {
  console.log(`listening on http://${config.host}:${String(config.port)}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopPolling();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
