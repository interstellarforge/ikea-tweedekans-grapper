import type { DatabaseSync } from "node:sqlite";

import { config } from "./config.ts";
import { COUNTRY_CODES, DEFAULT_COUNTRIES, isCountry } from "./countries.ts";
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

export type HomeAssistantSettings = {
  enabled: boolean;
  /** Base URL, e.g. http://homeassistant.local:8123 (no trailing slash). */
  baseUrl: string;
  /** Long-lived access token. */
  token: string;
  /** notify service names without the "notify." prefix, e.g. mobile_app_keess_iphone. */
  targets: string[];
};

export type Settings = {
  /** Enabled countries (stores of other countries are not fetched or shown). */
  countries: string[];
  pollIntervalMin: number;
  ntfyUrl: string;
  /** Public base URL of this app (no trailing slash); used for deep links in notifications. */
  appUrl: string;
  /** Home postcode (e.g. 1234AB) for the trip check. */
  homePostcode: string;
  /** Fuel price in EUR per litre. */
  fuelPrice: number;
  /** Car consumption in litres per 100 km. */
  consumptionPer100km: number;
  /** Maximum number of stores combined in one trip (1-8). */
  maxStops: number;
  /** Minutes spent inside each store for picking up. */
  stopMinutes: number;
  /** Value of one hour of your time in EUR (0 = ignore time). */
  hourlyRate: number;
  /** Routes may pass along all (non-excluded) stores; otherwise only followed stores. */
  routeAllStores: boolean;
  email: EmailSettings;
  homeAssistant: HomeAssistantSettings;
};

/** Settings as sent to the browser: the SMTP password is never returned. */
export type PublicSettings = Omit<Settings, "email" | "homeAssistant"> & {
  email: Omit<EmailSettings, "password"> & { passwordSet: boolean };
  homeAssistant: Omit<HomeAssistantSettings, "token"> & { tokenSet: boolean };
};

export type SettingsInput = {
  countries?: string[];
  pollIntervalMin?: number;
  ntfyUrl?: string;
  appUrl?: string;
  homePostcode?: string;
  fuelPrice?: number;
  consumptionPer100km?: number;
  maxStops?: number;
  stopMinutes?: number;
  hourlyRate?: number;
  routeAllStores?: boolean;
  email?: Partial<EmailSettings>;
  homeAssistant?: Partial<HomeAssistantSettings>;
};

const defaults = (): Settings => ({
  countries: DEFAULT_COUNTRIES,
  pollIntervalMin: config.pollIntervalMin,
  ntfyUrl: config.ntfyUrl ?? "",
  appUrl: process.env["APP_URL"] ?? "",
  homePostcode: "",
  fuelPrice: 2.1,
  consumptionPer100km: 7,
  maxStops: 3,
  stopMinutes: 20,
  hourlyRate: 0,
  routeAllStores: true,
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
  homeAssistant: { enabled: false, baseUrl: "", token: "", targets: [] },
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
    countries: parseCountries(map.get("countries")),
    pollIntervalMin: interval > 0 ? interval : d.pollIntervalMin,
    ntfyUrl: map.get("ntfyUrl") ?? d.ntfyUrl,
    appUrl: map.get("appUrl") ?? d.appUrl,
    homePostcode: map.get("homePostcode") ?? d.homePostcode,
    maxStops:
      Number(map.get("maxStops")) >= 1 && Number(map.get("maxStops")) <= 8
        ? Math.round(Number(map.get("maxStops")))
        : d.maxStops,
    stopMinutes:
      map.has("stopMinutes") && Number(map.get("stopMinutes")) >= 0
        ? Number(map.get("stopMinutes"))
        : d.stopMinutes,
    hourlyRate:
      map.has("hourlyRate") && Number(map.get("hourlyRate")) >= 0
        ? Number(map.get("hourlyRate"))
        : d.hourlyRate,
    routeAllStores: map.has("routeAllStores")
      ? map.get("routeAllStores") === "1"
      : d.routeAllStores,
    fuelPrice:
      Number(map.get("fuelPrice")) > 0
        ? Number(map.get("fuelPrice"))
        : d.fuelPrice,
    consumptionPer100km:
      Number(map.get("consumptionPer100km")) > 0
        ? Number(map.get("consumptionPer100km"))
        : d.consumptionPer100km,
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
    homeAssistant: {
      enabled: map.get("ha.enabled") === "1",
      baseUrl: map.get("ha.baseUrl") ?? d.homeAssistant.baseUrl,
      token: decryptSecret(map.get("ha.token") ?? ""),
      targets: parseTargets(map.get("ha.targets")),
    },
  };
}

function parseCountries(raw: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (c): c is string => typeof c === "string" && isCountry(c),
      );
      if (valid.length > 0) return valid;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_COUNTRIES;
}

function parseTargets(raw: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

export function toPublic(s: Settings): PublicSettings {
  const { password, ...email } = s.email;
  const { token, ...homeAssistant } = s.homeAssistant;
  return {
    ...s,
    email: { ...email, passwordSet: password !== "" },
    homeAssistant: { ...homeAssistant, tokenSet: token !== "" },
  };
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

  let countriesChanged: string[] | undefined;
  if (input.countries !== undefined) {
    const unique = [...new Set(input.countries)];
    if (unique.length === 0 || !unique.every((c) => isCountry(c))) {
      return `Kies minstens één land (${COUNTRY_CODES.join(", ")})`;
    }
    writes.push(["countries", JSON.stringify(unique)]);
    countriesChanged = unique;
  }
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
  if (input.appUrl !== undefined) {
    const url = input.appUrl.trim().replace(/\/+$/, "");
    if (url && !/^https?:\/\/[^\s/]+(\/\S*)?$/.test(url)) {
      return "App-URL moet er zo uitzien: https://tweedekans.example.nl";
    }
    writes.push(["appUrl", url]);
  }
  if (input.homePostcode !== undefined) {
    const pc = input.homePostcode.trim();
    if (pc && !/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(pc)) {
      return "Postcode moet er zo uitzien: 1234 AB";
    }
    writes.push(["homePostcode", pc.replace(/\s+/g, "").toUpperCase()]);
  }
  if (input.maxStops !== undefined) {
    if (
      !Number.isInteger(input.maxStops) ||
      input.maxStops < 1 ||
      input.maxStops > 8
    ) {
      return "Aantal filialen per rit moet tussen 1 en 8 liggen";
    }
    writes.push(["maxStops", String(input.maxStops)]);
  }
  if (input.stopMinutes !== undefined) {
    if (!(input.stopMinutes >= 0 && input.stopMinutes <= 240)) {
      return "Tijd per filiaal moet tussen 0 en 240 minuten liggen";
    }
    writes.push(["stopMinutes", String(Math.round(input.stopMinutes))]);
  }
  if (input.hourlyRate !== undefined) {
    if (!(input.hourlyRate >= 0 && input.hourlyRate <= 500)) {
      return "Uurtarief moet tussen 0 en 500 euro liggen";
    }
    writes.push(["hourlyRate", String(input.hourlyRate)]);
  }
  if (input.routeAllStores !== undefined) {
    writes.push(["routeAllStores", input.routeAllStores ? "1" : "0"]);
  }
  if (input.fuelPrice !== undefined) {
    if (!(input.fuelPrice > 0 && input.fuelPrice < 10)) {
      return "Benzineprijs moet tussen 0 en 10 euro per liter liggen";
    }
    writes.push(["fuelPrice", String(input.fuelPrice)]);
  }
  if (input.consumptionPer100km !== undefined) {
    if (!(input.consumptionPer100km > 0 && input.consumptionPer100km < 40)) {
      return "Verbruik moet tussen 0 en 40 liter per 100 km liggen";
    }
    writes.push(["consumptionPer100km", String(input.consumptionPer100km)]);
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
  const ha = input.homeAssistant;
  if (ha) {
    if (ha.baseUrl !== undefined) {
      const url = ha.baseUrl.trim().replace(/\/+$/, "");
      if (url && !/^https?:\/\/[^\s/]+(\/\S*)?$/.test(url)) {
        return "Home Assistant-URL moet er zo uitzien: http://homeassistant.local:8123";
      }
      writes.push(["ha.baseUrl", url]);
    }
    if (ha.enabled !== undefined) {
      writes.push(["ha.enabled", ha.enabled ? "1" : "0"]);
    }
    if (ha.targets !== undefined) {
      if (!ha.targets.every((t) => /^[a-z0-9_]+$/.test(t))) {
        return "Ongeldige Home Assistant-ontvanger";
      }
      writes.push(["ha.targets", JSON.stringify(ha.targets)]);
    }
    // Empty token = keep the stored one.
    if (ha.token) writes.push(["ha.token", encryptSecret(ha.token.trim())]);
  }
  db.exec("BEGIN");
  try {
    for (const [k, v] of writes) put.run(k, v);
    if (countriesChanged) {
      // stores of disabled countries drop out of every listing, search and trip calculation
      db.prepare("UPDATE stores SET enabled = 0").run();
      const mark = db.prepare(
        "UPDATE stores SET enabled = 1 WHERE country = ?",
      );
      for (const c of countriesChanged) mark.run(c);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return undefined;
}
