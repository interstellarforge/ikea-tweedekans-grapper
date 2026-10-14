import type { DatabaseSync } from "node:sqlite";

import nodemailer from "nodemailer";

import { config } from "./config.ts";
import type { PriceTag } from "./insights.ts";
import { type EmailSettings, getSettings } from "./settings.ts";
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

/** Sends an alert over every enabled channel; returns a per-channel result summary. */
export async function notifyAlert(
  db: DatabaseSync,
  alert: Alert,
): Promise<string> {
  const { ntfyUrl, email, appUrl } = getSettings(db);
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
