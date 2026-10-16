import { config } from "./config.ts";
import { COUNTRY_CODES, DEFAULT_COUNTRIES, isCountry } from "./countries.ts";
import type { Db } from "./db.ts";
import { decryptSecret, encryptSecret } from "./secrets.ts";

// ---------------------------------------------------------------- global (admin) settings

export type SmtpSettings = {
  host: string;
  port: number;
  /** true = implicit TLS (port 465); false = STARTTLS when offered (port 587). */
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type ChannelFlags = {
  ntfy: boolean;
  email: boolean;
  homeAssistant: boolean;
  app: boolean;
};

export type GlobalSettings = {
  /** Minutes between two fetches of all stores. */
  pollIntervalMin: number;
  registrationOpen: boolean;
  /** Notification types that exist for users; hidden types are neither shown nor sent. */
  channels: ChannelFlags;
  smtp: SmtpSettings;
};

export type PublicGlobalSettings = Omit<GlobalSettings, "smtp"> & {
  smtp: Omit<SmtpSettings, "password"> & { passwordSet: boolean };
  /** Whether the server has a base URL for personal ntfy topics (env NTFY_BASE_URL). */
  ntfyConfigured: boolean;
};

export type GlobalSettingsInput = {
  pollIntervalMin?: number;
  registrationOpen?: boolean;
  channels?: Partial<ChannelFlags>;
  smtp?: Partial<SmtpSettings>;
};

const ALL_CHANNELS: ChannelFlags = {
  ntfy: true,
  email: true,
  homeAssistant: true,
  app: true,
};

function rawMap(
  db: Db,
  table: "settings" | "user_settings",
  userId?: number,
): Map<string, string> {
  const rows =
    table === "settings"
      ? (db.prepare("SELECT key, value FROM settings").all() as {
          key: string;
          value: string;
        }[])
      : (db
          .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
          .all(userId ?? -1) as { key: string; value: string }[]);
  return new Map(rows.map((r) => [r.key, r.value]));
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw === undefined ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function getGlobalSettings(db: Db): GlobalSettings {
  const map = rawMap(db, "settings");
  const interval = Number(map.get("pollIntervalMin"));
  const port = Number(map.get("email.port"));
  const channels = parseJson<Partial<ChannelFlags>>(map.get("channels"), {});
  return {
    pollIntervalMin: interval > 0 ? interval : config.pollIntervalMin,
    registrationOpen: map.get("registrationOpen") !== "0",
    channels: {
      ntfy: channels.ntfy ?? ALL_CHANNELS.ntfy,
      email: channels.email ?? ALL_CHANNELS.email,
      homeAssistant: channels.homeAssistant ?? ALL_CHANNELS.homeAssistant,
      app: channels.app ?? ALL_CHANNELS.app,
    },
    smtp: {
      host: map.get("email.host") ?? "",
      port: port > 0 ? port : 587,
      secure: map.get("email.secure") === "1",
      user: map.get("email.user") ?? "",
      password: decryptSecret(map.get("email.password") ?? ""),
      from: map.get("email.from") ?? "",
    },
  };
}

export function toPublicGlobal(g: GlobalSettings): PublicGlobalSettings {
  const { password, ...smtp } = g.smtp;
  return {
    ...g,
    smtp: { ...smtp, passwordSet: password !== "" },
    ntfyConfigured: config.ntfyBaseUrl !== "",
  };
}

function putAll(
  db: Db,
  table: "settings" | "user_settings",
  userId: number,
  writes: [string, string][],
): void {
  const put =
    table === "settings"
      ? db.prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        )
      : db.prepare(
          `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
           ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
        );
  db.exec("BEGIN");
  try {
    for (const [k, v] of writes) {
      if (table === "settings") put.run(k, v);
      else put.run(userId, k, v);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Validates and stores admin settings; returns an error message for invalid input. */
export function saveGlobalSettings(
  db: Db,
  input: GlobalSettingsInput,
): string | undefined {
  const writes: [string, string][] = [];
  if (input.pollIntervalMin !== undefined) {
    if (!(input.pollIntervalMin >= 5 && input.pollIntervalMin <= 1440)) {
      return "Interval moet tussen 5 en 1440 minuten liggen";
    }
    writes.push(["pollIntervalMin", String(Math.round(input.pollIntervalMin))]);
  }
  if (input.registrationOpen !== undefined) {
    writes.push(["registrationOpen", input.registrationOpen ? "1" : "0"]);
  }
  if (input.channels) {
    const next = { ...getGlobalSettings(db).channels, ...input.channels };
    writes.push(["channels", JSON.stringify(next)]);
  }
  const s = input.smtp;
  if (s) {
    if (s.port !== undefined) {
      if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) {
        return "Ongeldige SMTP-poort";
      }
      writes.push(["email.port", String(s.port)]);
    }
    for (const key of ["host", "user", "from"] as const) {
      const v = s[key];
      if (v !== undefined) writes.push([`email.${key}`, v.trim()]);
    }
    if (s.secure !== undefined) {
      writes.push(["email.secure", s.secure ? "1" : "0"]);
    }
    // Empty password = keep the stored one.
    if (s.password) {
      const host = (s.host ?? getGlobalSettings(db).smtp.host).toLowerCase();
      // Google shows app passwords in groups of four; the spaces are not part of it.
      const pw = host.endsWith("gmail.com")
        ? s.password.replace(/\s+/g, "")
        : s.password;
      writes.push(["email.password", encryptSecret(pw)]);
    }
  }
  putAll(db, "settings", 0, writes);
  return undefined;
}

// ---------------------------------------------------------------- per-user settings

export type HomeAssistantSettings = {
  /** Base URL, e.g. http://homeassistant.local:8123 (no trailing slash). */
  baseUrl: string;
  /** Long-lived access token. */
  token: string;
  /** notify service names without the "notify." prefix, e.g. mobile_app_keess_iphone. */
  targets: string[];
};

export type UserSettings = {
  /** Countries whose stores this user sees. */
  countries: string[];
  homePostcode: string;
  fuelPrice: number;
  consumptionPer100km: number;
  maxStops: number;
  stopMinutes: number;
  hourlyRate: number;
  maxTripMinutes: number;
  routeAllStores: boolean;
  /** Which notification types the user wants (they must also be enabled by the admin). */
  notify: ChannelFlags;
  homeAssistant: HomeAssistantSettings;
};

export type PublicUserSettings = Omit<UserSettings, "homeAssistant"> & {
  homeAssistant: Omit<HomeAssistantSettings, "token"> & { tokenSet: boolean };
};

export type UserSettingsInput = Partial<
  Omit<UserSettings, "homeAssistant" | "notify">
> & {
  notify?: Partial<ChannelFlags>;
  homeAssistant?: Partial<HomeAssistantSettings>;
};

const userDefaults = (): UserSettings => ({
  countries: DEFAULT_COUNTRIES,
  homePostcode: "",
  fuelPrice: 2.1,
  consumptionPer100km: 7,
  maxStops: 3,
  stopMinutes: 20,
  hourlyRate: 0,
  maxTripMinutes: 0,
  routeAllStores: true,
  notify: { ntfy: true, email: false, homeAssistant: false, app: true },
  homeAssistant: { baseUrl: "", token: "", targets: [] },
});

function parseCountries(raw: string | undefined): string[] {
  const parsed = parseJson<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    const valid = parsed.filter(
      (c): c is string => typeof c === "string" && isCountry(c),
    );
    if (valid.length > 0) return valid;
  }
  return DEFAULT_COUNTRIES;
}

function parseTargets(raw: string | undefined): string[] {
  const parsed = parseJson<unknown>(raw, []);
  return Array.isArray(parsed)
    ? parsed.filter((t): t is string => typeof t === "string")
    : [];
}

const num = (
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= min && n <= max
    ? n
    : fallback;
};

export function getUserSettings(db: Db, userId: number): UserSettings {
  const map = rawMap(db, "user_settings", userId);
  const d = userDefaults();
  const flag = (key: string, fallback: boolean): boolean =>
    map.has(key) ? map.get(key) === "1" : fallback;
  return {
    countries: parseCountries(map.get("countries")),
    homePostcode: map.get("homePostcode") ?? d.homePostcode,
    fuelPrice: num(map.get("fuelPrice"), d.fuelPrice, 0.01, 9.99),
    consumptionPer100km: num(
      map.get("consumptionPer100km"),
      d.consumptionPer100km,
      0.1,
      39.9,
    ),
    maxStops: Math.round(num(map.get("maxStops"), d.maxStops, 1, 8)),
    stopMinutes: num(map.get("stopMinutes"), d.stopMinutes, 0, 240),
    hourlyRate: num(map.get("hourlyRate"), d.hourlyRate, 0, 500),
    maxTripMinutes: num(map.get("maxTripMinutes"), d.maxTripMinutes, 0, 1440),
    routeAllStores: flag("routeAllStores", d.routeAllStores),
    notify: {
      ntfy: flag("notify.ntfy", d.notify.ntfy),
      email: flag("notify.email", d.notify.email),
      homeAssistant: flag("notify.ha", d.notify.homeAssistant),
      app: flag("notify.app", d.notify.app),
    },
    homeAssistant: {
      baseUrl: map.get("ha.baseUrl") ?? d.homeAssistant.baseUrl,
      token: decryptSecret(map.get("ha.token") ?? ""),
      targets: parseTargets(map.get("ha.targets")),
    },
  };
}

export function toPublicUser(s: UserSettings): PublicUserSettings {
  const { token, ...homeAssistant } = s.homeAssistant;
  return { ...s, homeAssistant: { ...homeAssistant, tokenSet: token !== "" } };
}

/** Validates and stores one user's settings; returns an error message for invalid input. */
export function saveUserSettings(
  db: Db,
  userId: number,
  input: UserSettingsInput,
): string | undefined {
  const writes: [string, string][] = [];
  if (input.countries !== undefined) {
    const unique = [...new Set(input.countries)];
    if (unique.length === 0 || !unique.every((c) => isCountry(c))) {
      return `Kies minstens één land (${COUNTRY_CODES.join(", ")})`;
    }
    writes.push(["countries", JSON.stringify(unique)]);
  }
  if (input.homePostcode !== undefined) {
    const pc = input.homePostcode.trim();
    if (pc && !/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(pc)) {
      return "Postcode moet er zo uitzien: 1234 AB";
    }
    writes.push(["homePostcode", pc.replace(/\s+/g, "").toUpperCase()]);
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
  if (input.maxTripMinutes !== undefined) {
    if (!(input.maxTripMinutes >= 0 && input.maxTripMinutes <= 1440)) {
      return "Maximale tijd moet tussen 0 en 1440 minuten liggen (0 = geen limiet)";
    }
    writes.push(["maxTripMinutes", String(Math.round(input.maxTripMinutes))]);
  }
  if (input.routeAllStores !== undefined) {
    writes.push(["routeAllStores", input.routeAllStores ? "1" : "0"]);
  }
  const n = input.notify;
  if (n) {
    if (n.ntfy !== undefined) writes.push(["notify.ntfy", n.ntfy ? "1" : "0"]);
    if (n.email !== undefined)
      writes.push(["notify.email", n.email ? "1" : "0"]);
    if (n.homeAssistant !== undefined) {
      writes.push(["notify.ha", n.homeAssistant ? "1" : "0"]);
    }
    if (n.app !== undefined) writes.push(["notify.app", n.app ? "1" : "0"]);
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
    if (ha.targets !== undefined) {
      if (!ha.targets.every((t) => /^[a-z0-9_]+$/.test(t))) {
        return "Ongeldige Home Assistant-ontvanger";
      }
      writes.push(["ha.targets", JSON.stringify(ha.targets)]);
    }
    // Empty token = keep the stored one.
    if (ha.token) writes.push(["ha.token", encryptSecret(ha.token.trim())]);
  }
  putAll(db, "user_settings", userId, writes);
  return undefined;
}

// ---------------------------------------------------------------- raw (global) key/value

/** Raw key/value access for values that are not part of the settings forms. */
export function getRawSetting(db: Db, key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRawSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
