export const config = {
  port: Number(process.env["PORT"] ?? 8080),
  host: process.env["HOST"] ?? "0.0.0.0",
  dbPath: process.env["DB_PATH"] ?? "data/tweedekans.db",
  pollIntervalMin: Number(process.env["POLL_INTERVAL_MIN"] ?? 15),
  country: process.env["IKEA_COUNTRY"] ?? "nl",
  language: process.env["IKEA_LANGUAGE"] ?? "nl",
  /** Public URL of this app (deep links in notifications), no trailing slash. */
  /**
   * Reverse proxies in front of the app that append to `x-forwarded-for` (1 = one proxy such as
   * Nginx Proxy Manager, 2 = e.g. Cloudflare + NPM). 0 = no proxy: the header is not trusted.
   */
  trustedProxyHops: Number(process.env["TRUSTED_PROXY_HOPS"] ?? 1),
  /** Firebase service account (JSON string or path) used to send push notifications to the app. */
  fcmServiceAccount: (process.env["FCM_SERVICE_ACCOUNT"] ?? "").trim(),
  appUrl: (process.env["APP_URL"] ?? "").replace(/\/+$/, ""),
  /** Base URL of the ntfy server; every user gets a personal topic below it. */
  ntfyBaseUrl: (process.env["NTFY_BASE_URL"] ?? "").replace(/\/+$/, ""),
  /** Only this e-mail address may create the first (admin) account. Strongly recommended. */
  adminEmail: (process.env["ADMIN_EMAIL"] ?? "").trim().toLowerCase(),
  // Public client key shipped in IKEA's own as-is web app; override if it rotates.
  clientId:
    process.env["IKEA_CLIENT_ID"] ?? "d530fa19-39b9-4f3f-9276-61146d470502",
  apiRoot: "https://web-api.ikea.com/circular/circular-asis",
};
