import type { DatabaseSync } from "node:sqlite";

import nodemailer from "nodemailer";

import { config } from "./config.ts";
import { COUNTRIES, isCountry } from "./countries.ts";
import type { Ctx } from "./db.ts";
import type { PriceTag } from "./insights.ts";
import {
  getGlobalSettings,
  getUserSettings,
  type HomeAssistantSettings,
  type SmtpSettings,
} from "./settings.ts";
import type { User } from "./users.ts";
import type { Alert } from "./watchlist.ts";

const offersBase = (country = "nl"): string =>
  `https://www.ikea.com/${isCountry(country) ? COUNTRIES[country].ikeaPath : COUNTRIES.nl.ikeaPath}/second-hand/buy-from-ikea/`;

const OFFERS_URL = offersBase();

const euro = (n: number): string => `€${n.toFixed(2).replace(".", ",")}`;
const ascii = (s: string): string =>
  s
    .replace(/€\s?/g, "EUR ")
    .normalize("NFD")
    .replace(/[^\x20-\x7e]/g, "");

export function tagText(tag: PriceTag | undefined): string {
  if (!tag) return "";
  if (tag.kind === "lowest")
    return `nieuwe laagste prijs (eerder ${euro(tag.low)})`;
  if (tag.kind === "equal")
    return `gelijk aan laagste prijs (${euro(tag.low)})`;
  return `${euro(tag.diff)} duurder dan laagste eerder (${euro(tag.low)})`;
}

const headline = (a: Alert): string =>
  `${a.title} ligt in ${a.storeName} voor ${euro(a.price)}!`;

export type NtfyLinks = {
  /** Opened when the notification itself is tapped. */
  click: string;
  /** Action buttons under the notification (max 3 in ntfy). */
  actions: { label: string; url: string }[];
};

/** Normalised store slug as used in IKEA's own as-is URLs (e.g. "IKEA Den Bosch" -> "den+bosch"). */
export const storeSlug = (storeName: string): string =>
  storeName
    .toLowerCase()
    .replace(/ikea /g, "")
    .trim()
    .replace(/\//g, "")
    .replace(/-/g, "")
    .replace(/\s+/g, "+");

/** Deep link to one offer on IKEA's tweedekanshoek page. */
export const ikeaOfferUrl = (
  storeName: string,
  offerNumber: string,
  country = "nl",
): string => `${offersBase(country)}#/${storeSlug(storeName)}/${offerNumber}`;

/** Tap target and buttons for an alert; the in-app buttons need the public app URL. */
export function alertLinks(
  appUrl: string,
  offer?: {
    storeName: string;
    offerNumber: string;
    articleNumber: string;
    country?: string;
  },
): NtfyLinks {
  const click = offer
    ? ikeaOfferUrl(offer.storeName, offer.offerNumber, offer.country)
    : appUrl
      ? `${appUrl}/alerts`
      : OFFERS_URL;
  if (!appUrl) return { click, actions: [] };
  return {
    click,
    actions: [
      { label: "Meldingen", url: `${appUrl}/alerts` },
      ...(offer
        ? [
            {
              label: "Product",
              url: `${appUrl}/product/${offer.articleNumber}`,
            },
          ]
        : []),
    ],
  };
}

export async function sendNtfy(
  ntfyUrl: string,
  title: string,
  body: string,
  links: NtfyLinks = { click: OFFERS_URL, actions: [] },
): Promise<void> {
  const actions = links.actions
    .slice(0, 3)
    .map((a) => `view, ${ascii(a.label)}, ${a.url}`)
    .join("; ");
  const res = await fetch(ntfyUrl, {
    method: "POST",
    headers: {
      Title: ascii(title),
      Click: links.click,
      Tags: "shopping_cart",
      ...(actions ? { Actions: actions } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ntfy antwoordde ${String(res.status)}`);
}

export async function sendEmail(
  smtp: SmtpSettings,
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  if (!smtp.host)
    throw new Error("De beheerder heeft nog geen SMTP-server ingesteld");
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject,
    text,
  });
}

async function haRequest<T>(
  baseUrl: string,
  token: string,
  path: string,
  init?: { method: "POST"; body: unknown },
): Promise<T> {
  if (!baseUrl || !token)
    throw new Error("Home Assistant-URL en token zijn verplicht");
  const res = await fetch(`${baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401)
    throw new Error("Home Assistant: token ongeldig (401)");
  if (!res.ok)
    throw new Error(`Home Assistant antwoordde ${String(res.status)}`);
  return (await res.json()) as T;
}

/** Notify services available in Home Assistant (mobile apps etc.), without the "notify." prefix. */
export async function listHaNotifyTargets(
  baseUrl: string,
  token: string,
): Promise<string[]> {
  const domains = await haRequest<
    { domain: string; services: Record<string, unknown> }[]
  >(baseUrl, token, "/api/services");
  const notify = domains.find((d) => d.domain === "notify");
  const generic = new Set([
    "notify",
    "send_message",
    "persistent_notification",
  ]);
  return Object.keys(notify?.services ?? {})
    .filter((name) => !generic.has(name))
    .sort((a, b) => a.localeCompare(b));
}

export async function sendHa(
  cfg: HomeAssistantSettings,
  title: string,
  message: string,
  links: NtfyLinks,
): Promise<void> {
  if (cfg.targets.length === 0)
    throw new Error("Geen Home Assistant-ontvangers gekozen");
  // Companion app: `url` (iOS) / `clickAction` (Android) open on tap; URI actions add buttons.
  const data = {
    url: links.click,
    clickAction: links.click,
    ...(links.actions.length
      ? {
          actions: links.actions.map((a) => ({
            action: "URI",
            title: a.label,
            uri: a.url,
          })),
        }
      : {}),
  };
  const results = await Promise.allSettled(
    cfg.targets.map((target) =>
      haRequest(cfg.baseUrl, cfg.token, `/api/services/notify/${target}`, {
        method: "POST",
        body: { title, message, data },
      }),
    ),
  );
  const failed = results.flatMap((r, i) =>
    r.status === "rejected"
      ? [
          `${cfg.targets[i] ?? "?"}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        ]
      : [],
  );
  if (failed.length) throw new Error(failed.join("; "));
}

/** Personal ntfy topic URL of a user; undefined when the server has no ntfy base URL. */
export function ntfyUrlFor(user: Pick<User, "ntfyToken">): string | undefined {
  return config.ntfyBaseUrl
    ? `${config.ntfyBaseUrl}/tweedekans-${user.ntfyToken}`
    : undefined;
}

export type ChannelName = "ntfy" | "email" | "homeAssistant";

/** What can actually be used for this user: visible (admin) + wanted (user) + configured. */
export function channelStatus(
  db: DatabaseSync,
  user: User,
): Record<
  ChannelName,
  { visible: boolean; enabled: boolean; configured: boolean }
> {
  const g = getGlobalSettings(db);
  const u = getUserSettings(db, user.id);
  return {
    ntfy: {
      visible: g.channels.ntfy,
      enabled: u.notify.ntfy,
      configured: ntfyUrlFor(user) !== undefined,
    },
    email: {
      visible: g.channels.email,
      enabled: u.notify.email,
      configured: g.smtp.host !== "",
    },
    homeAssistant: {
      visible: g.channels.homeAssistant,
      enabled: u.notify.homeAssistant,
      configured:
        u.homeAssistant.baseUrl !== "" &&
        u.homeAssistant.token !== "" &&
        u.homeAssistant.targets.length > 0,
    },
  };
}

export type Message = {
  title: string;
  body: string;
  links: NtfyLinks;
  /** Longer text for e-mail; defaults to title + body + link. */
  emailText?: string;
};

/**
 * Sends a message to one user over the channels that are visible, wanted and configured.
 * `only` limits it to one channel (used by the test buttons, which ignore the user's own toggle).
 * Returns a per-channel result summary.
 */
export async function deliver(
  db: DatabaseSync,
  user: User,
  msg: Message,
  only?: ChannelName,
): Promise<string> {
  const status = channelStatus(db, user);
  const g = getGlobalSettings(db);
  const u = getUserSettings(db, user.id);
  const wants = (c: ChannelName): boolean =>
    status[c].visible &&
    (only ? only === c : status[c].enabled) &&
    status[c].configured;

  const jobs: [string, Promise<void>][] = [];
  const ntfyUrl = ntfyUrlFor(user);
  if (wants("ntfy") && ntfyUrl) {
    jobs.push(["ntfy", sendNtfy(ntfyUrl, msg.title, msg.body, msg.links)]);
  }
  if (wants("email")) {
    jobs.push([
      "e-mail",
      sendEmail(
        g.smtp,
        user.email,
        msg.title,
        msg.emailText ??
          `${msg.title}

${msg.body}

${msg.links.click}
`,
      ),
    ]);
  }
  if (wants("homeAssistant")) {
    jobs.push([
      "home assistant",
      sendHa(u.homeAssistant, msg.title, msg.body, msg.links),
    ]);
  }
  if (jobs.length === 0) {
    if (only) {
      if (!status[only].visible)
        throw new Error("Dit meldingstype is uitgeschakeld door de beheerder");
      throw new Error("Dit meldingstype is nog niet ingesteld");
    }
    return "geen kanaal actief";
  }
  const results = await Promise.allSettled(jobs.map(([, job]) => job));
  const failed = results.flatMap((r, i) =>
    r.status === "rejected"
      ? [
          `${jobs[i]?.[0] ?? "?"}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        ]
      : [],
  );
  if (only && failed.length) throw new Error(failed.join("; "));
  return results
    .map((r, i) => {
      const name = jobs[i]?.[0] ?? "?";
      if (r.status === "fulfilled") return `${name}: ok`;
      const msgText =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[notify] ${name} failed:`, msgText);
      return `${name}: fout (${msgText})`;
    })
    .join(" · ");
}

/**
 * Content for a test notification. Uses a real current offer so that tapping it behaves exactly
 * like a real alert (opens that offer at IKEA); falls back to a generic message without offers.
 */
export function testContent(
  db: DatabaseSync,
  ctx: Ctx,
  fallbackBody: string,
): Message {
  const marks = ctx.countries.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT o.title, o.description, o.price, o.offer_number, o.article_number, s.name, s.country
       FROM offers o JOIN stores s ON s.store_id = o.store_id
       LEFT JOIN user_stores us ON us.store_id = s.store_id AND us.user_id = ?
       WHERE o.active = 1 AND s.country IN (${marks}) AND o.article_number IS NOT NULL
       ORDER BY COALESCE(us.followed, 0) DESC, o.last_seen DESC LIMIT 1`,
    )
    .get(ctx.userId, ...ctx.countries) as
    | {
        title: string;
        description: string;
        price: number;
        offer_number: string;
        article_number: string;
        name: string;
        country: string;
      }
    | undefined;
  if (!row) {
    return {
      title: "Tweedekans: testmelding",
      body: fallbackBody,
      links: alertLinks(config.appUrl),
    };
  }
  const alert = {
    title: row.title,
    storeName: row.name,
    price: row.price,
  } as Alert;
  return {
    title: `Tweedekans (test): ${headline(alert)}`,
    body: `${row.description} voor ${euro(row.price)} — dit is een testmelding, tikken opent deze aanbieding bij IKEA.`,
    links: alertLinks(config.appUrl, {
      storeName: row.name,
      offerNumber: row.offer_number,
      articleNumber: row.article_number,
      country: row.country,
    }),
  };
}

/** Sends an alert to one user over their active channels; returns a per-channel summary. */
export async function notifyAlert(
  db: DatabaseSync,
  user: User,
  alert: Alert,
): Promise<string> {
  const appUrl = config.appUrl;
  const links = alertLinks(appUrl, alert);
  const body = `${alert.description} voor ${euro(alert.price)}${alert.note ? ` — ${alert.note}` : ""}`;
  const title = `Tweedekans: ${headline(alert)}`;
  return deliver(db, user, {
    title,
    body,
    links,
    emailText: `${headline(alert)}\n\n${body}\nArtikel ${alert.articleNumber} · aanbieding ${alert.offerNumber}\n\nBekijk bij IKEA: ${links.click}${appUrl ? `\nProduct in de app: ${appUrl}/product/${alert.articleNumber}\nAlle meldingen: ${appUrl}/alerts` : ""}\n`,
  });
}
