import type { DatabaseSync } from "node:sqlite";

import nodemailer from "nodemailer";

import { config } from "./config.ts";
import type { PriceTag } from "./insights.ts";
import { type EmailSettings, getSettings } from "./settings.ts";
import type { Alert } from "./watchlist.ts";

const OFFERS_URL = `https://www.ikea.com/${config.country}/${config.language}/second-hand/buy-from-ikea/`;

const euro = (n: number): string => `€${n.toFixed(2).replace(".", ",")}`;
const ascii = (s: string): string =>
  s.normalize("NFD").replace(/[^\x20-\x7e]/g, "");

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

export async function sendNtfy(
  ntfyUrl: string,
  title: string,
  body: string,
): Promise<void> {
  const res = await fetch(ntfyUrl, {
    method: "POST",
    headers: { Title: ascii(title), Click: OFFERS_URL, Tags: "shopping_cart" },
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

/** Sends an alert over every enabled channel; failures are logged, never thrown. */
export async function notifyAlert(
  db: DatabaseSync,
  alert: Alert,
  tag: PriceTag | undefined,
): Promise<void> {
  const { ntfyUrl, email } = getSettings(db);
  const note = tagText(tag);
  const body = `${alert.description} voor ${euro(alert.price)}${note ? ` — ${note}` : ""}`;
  const jobs: Promise<void>[] = [];
  if (ntfyUrl)
    jobs.push(sendNtfy(ntfyUrl, `Tweedekans: ${headline(alert)}`, body));
  if (email.enabled) {
    jobs.push(
      sendEmail(
        email,
        `Tweedekans: ${headline(alert)}`,
        `${headline(alert)}\n\n${body}\nArtikel ${alert.articleNumber} · aanbieding ${alert.offerNumber}\n\n${OFFERS_URL}\n`,
      ),
    );
  }
  for (const result of await Promise.allSettled(jobs)) {
    if (result.status === "rejected")
      console.error("[notify] failed:", result.reason);
  }
}
