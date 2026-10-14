import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { startPolling } from "./poller.ts";
import { createApp } from "./server.ts";

const db = openDb(config.dbPath);
const stopPolling = startPolling(db);
const server = createApp(db).listen(config.port, config.host, () => {
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
