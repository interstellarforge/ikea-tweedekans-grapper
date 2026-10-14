export const config = {
  port: Number(process.env["PORT"] ?? 8080),
  host: process.env["HOST"] ?? "0.0.0.0",
  dbPath: process.env["DB_PATH"] ?? "data/tweedekans.db",
  pollIntervalMin: Number(process.env["POLL_INTERVAL_MIN"] ?? 15),
  country: process.env["IKEA_COUNTRY"] ?? "nl",
  language: process.env["IKEA_LANGUAGE"] ?? "nl",
  ntfyUrl: process.env["NTFY_URL"],
  // Public client key shipped in IKEA's own as-is web app; override if it rotates.
  clientId:
    process.env["IKEA_CLIENT_ID"] ?? "d530fa19-39b9-4f3f-9276-61146d470502",
  apiRoot: "https://web-api.ikea.com/circular/circular-asis",
};
