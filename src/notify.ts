import type { DatabaseSync } from "node:sqlite";

import nodemailer from "nodemailer";

import { config } from "./config.ts";
import type { PriceTag } from "./insights.ts";
import {
  type EmailSettings,
  getSettings,
  type HomeAssistantSettings,
} from "./settings.ts";
import type { Alert } from "./watchlist.ts";

const OFFERS_URL = `https://www.ikea.com/${config.country}/${config.language}/second-hand/buy-from-ikea/`;

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
export const ikeaOfferUrl = (storeName: string, offerNumber: string): string =>
  `${OFFERS_URL}#/${storeSlug(storeName)}/${offerNumber}`;

/** Tap target and buttons for an alert; the in-app buttons need the public app URL. */
export function alertLinks(
  appUrl: string,
  offer?: { storeName: string; offerNumber: string; articleNumber: string },
): NtfyLinks {
  const click = offer
    ? ikeaOfferUrl(offer.storeName, offer.offerNumber)
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
  cfg: EmailSettings,
  subject: string,
  text: string,
): Promise<void> {
  if (!cfg.host || !cfg.to)
    throw new Error("SMTP-server en ontvanger zijn verplicht");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail({
    from: cfg.from || cfg.user,
    to: cfg.to,
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

/**
 * Content for a test notification. Uses a real current offer so that tapping it behaves exactly
 * like a real alert (opens that offer at IKEA); falls back to a generic message without offers.
 */
export function testContent(
  db: DatabaseSync,
  appUrl: string,
  fallbackBody: string,
): { title: string; body: string; links: NtfyLinks } {
  const row = db
    .prepare(
      `SELECT o.title, o.description, o.price, o.offer_number, o.article_number, s.name
       FROM offers o JOIN stores s ON s.store_id = o.store_id
       WHERE o.active = 1 AND o.article_number IS NOT NULL
       ORDER BY s.followed DESC, o.last_seen DESC LIMIT 1`,
    )
    .get() as
    | {
        title: string;
        description: string;
        price: number;
        offer_number: string;
        article_number: string;
        name: string;
      }
    | undefined;
  if (!row) {
    return {
      title: "Tweedekans: testmelding",
      body: fallbackBody,
      links: alertLinks(appUrl),
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
    links: alertLinks(appUrl, {
      storeName: row.name,
      offerNumber: row.offer_number,
      articleNumber: row.article_number,
    }),
  };
}

/** Sends an alert over every enabled channel; returns a per-channel result summary. */
export async function notifyAlert(
  db: DatabaseSync,
  alert: Alert,
): Promise<string> {
  const { ntfyUrl, email, appUrl, homeAssistant } = getSettings(db);
  const links = alertLinks(appUrl, alert);
  const body = `${alert.description} voor ${euro(alert.price)}${alert.note ? ` — ${alert.note}` : ""}`;
  const jobs: [string, Promise<void>][] = [];
  if (ntfyUrl) {
    jobs.push([
      "ntfy",
      sendNtfy(ntfyUrl, `Tweedekans: ${headline(alert)}`, body, links),
    ]);
  }
  if (email.enabled) {
    jobs.push([
      "e-mail",
      sendEmail(
        email,
        `Tweedekans: ${headline(alert)}`,
        `${headline(alert)}\n\n${body}\nArtikel ${alert.articleNumber} · aanbieding ${alert.offerNumber}\n\nBekijk bij IKEA: ${links.click}${appUrl ? `\nProduct in de app: ${appUrl}/product/${alert.articleNumber}\nAlle meldingen: ${appUrl}/alerts` : ""}\n`,
      ),
    ]);
  }
  if (homeAssistant.enabled) {
    jobs.push([
      "home assistant",
      sendHa(homeAssistant, `Tweedekans: ${headline(alert)}`, body, links),
    ]);
  }
  if (jobs.length === 0) return "geen kanaal ingesteld";
  const results = await Promise.allSettled(jobs.map(([, job]) => job));
  return results
    .map((r, i) => {
      const name = jobs[i]?.[0] ?? "?";
      if (r.status === "fulfilled") return `${name}: ok`;
      const msg =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[notify] ${name} failed:`, msg);
      return `${name}: fout (${msg})`;
    })
    .join(" · ");
}
