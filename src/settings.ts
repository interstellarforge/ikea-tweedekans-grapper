import type { DatabaseSync } from "node:sqlite";

import { config } from "./config.ts";
import { decryptSecret, encryptSecret } from "./secrets.ts";

export type EmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  /** true = implicit TLS (port 465); false = STARTTLS when offered (port 587). */
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
};

export type Settings = {
  pollIntervalMin: number;
  ntfyUrl: string;
  email: EmailSettings;
};

/** Settings as sent to the browser: the SMTP password is never returned. */
export type PublicSettings = Omit<Settings, "email"> & {
  email: Omit<EmailSettings, "password"> & { passwordSet: boolean };
};

export type SettingsInput = {
  pollIntervalMin?: number;
  ntfyUrl?: string;
  email?: Partial<EmailSettings>;
};

const defaults = (): Settings => ({
  pollIntervalMin: config.pollIntervalMin,
  ntfyUrl: config.ntfyUrl ?? "",
  email: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    from: "",
    to: "",
  },
});

export function getSettings(db: DatabaseSync): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const d = defaults();
  const interval = Number(map.get("pollIntervalMin"));
  const port = Number(map.get("email.port"));
  return {
    pollIntervalMin: interval > 0 ? interval : d.pollIntervalMin,
    ntfyUrl: map.get("ntfyUrl") ?? d.ntfyUrl,
    email: {
      enabled: map.get("email.enabled") === "1",
      host: map.get("email.host") ?? d.email.host,
      port: port > 0 ? port : d.email.port,
      secure: map.get("email.secure") === "1",
      user: map.get("email.user") ?? d.email.user,
      password: decryptSecret(map.get("email.password") ?? d.email.password),
      from: map.get("email.from") ?? d.email.from,
      to: map.get("email.to") ?? d.email.to,
    },
  };
}

export function toPublic(s: Settings): PublicSettings {
  const { password, ...email } = s.email;
  return { ...s, email: { ...email, passwordSet: password !== "" } };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates and stores settings; returns an error message for invalid input. */
export function saveSettings(
  db: DatabaseSync,
  input: SettingsInput,
): string | undefined {
  const put = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );
  const writes: [string, string][] = [];

  if (input.pollIntervalMin !== undefined) {
    if (!(input.pollIntervalMin >= 5 && input.pollIntervalMin <= 1440)) {
      return "Interval moet tussen 5 en 1440 minuten liggen";
    }
    writes.push(["pollIntervalMin", String(Math.round(input.pollIntervalMin))]);
  }
  if (input.ntfyUrl !== undefined) {
    const url = input.ntfyUrl.trim();
    if (url && !/^https?:\/\//.test(url)) {
      return "ntfy-URL moet met http(s):// beginnen";
    }
    writes.push(["ntfyUrl", url]);
  }
  const e = input.email;
  if (e) {
    if (e.port !== undefined) {
      if (!Number.isInteger(e.port) || e.port < 1 || e.port > 65535) {
        return "Ongeldige SMTP-poort";
      }
      writes.push(["email.port", String(e.port)]);
    }
    for (const key of ["host", "user", "from", "to"] as const) {
      const v = e[key];
      if (v === undefined) continue;
      const value = v.trim();
      if (key === "to" || key === "from") {
        const bad = value
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
          .find((a) => !EMAIL_RE.test(a.replace(/^.*<(.+)>$/, "$1")));
        if (bad) return `Ongeldig e-mailadres: ${bad}`;
      }
      writes.push([`email.${key}`, value]);
    }
    if (e.secure !== undefined)
      writes.push(["email.secure", e.secure ? "1" : "0"]);
    if (e.enabled !== undefined)
      writes.push(["email.enabled", e.enabled ? "1" : "0"]);
    // Empty password = keep the stored one.
    if (e.password) {
      // Google shows app passwords in groups of four; the spaces are not part of it.
      const host = (e.host ?? "").toLowerCase();
      const pw = host.endsWith("gmail.com")
        ? e.password.replace(/\s+/g, "")
        : e.password;
      writes.push(["email.password", encryptSecret(pw)]);
    }
  }
  db.exec("BEGIN");
  try {
    for (const [k, v] of writes) put.run(k, v);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return undefined;
}
