import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

import { config } from "./config.ts";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export type PushMessage = {
  title: string;
  body: string;
  /** Delivered to the app next to the notification (strings only, as FCM requires). */
  data: Record<string, string>;
  /** Android notification channel id (must exist in the app). */
  channelId: string;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_TTL_S = 3600;
const EXPIRY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

let cachedAccount: ServiceAccount | undefined;
let cachedToken: { value: string; expiresAt: number } | undefined;

/** The FCM service account from FCM_SERVICE_ACCOUNT (a JSON string or a path to the JSON file). */
function serviceAccount(): ServiceAccount | undefined {
  if (cachedAccount) return cachedAccount;
  const raw = config.fcmServiceAccount;
  if (raw === "") return undefined;
  try {
    const json = raw.trimStart().startsWith("{")
      ? raw
      : readFileSync(raw, "utf8");
    cachedAccount = JSON.parse(json) as ServiceAccount;
    return cachedAccount;
  } catch {
    return undefined;
  }
}

export const pushConfigured = (): boolean => serviceAccount() !== undefined;

const b64 = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - EXPIRY_MARGIN_MS > now) {
    return cachedToken.value;
  }
  const issued = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issued,
    exp: issued + TOKEN_TTL_S,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.private_key)
    .toString("base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google OAuth antwoordde ${String(res.status)}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

export type PushResult = "sent" | "unregistered";

/** Sends one push; "unregistered" means the device token is dead and should be removed. */
export async function sendPush(
  pushToken: string,
  message: PushMessage,
): Promise<PushResult> {
  const account = serviceAccount();
  if (!account) throw new Error("FCM is niet geconfigureerd");
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${await accessToken(account)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: pushToken,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: {
            priority: "HIGH",
            notification: { channel_id: message.channelId },
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (res.ok) return "sent";
  if (res.status === 404 || res.status === 400) {
    const text = await res.text();
    if (/UNREGISTERED|INVALID_ARGUMENT/.test(text)) return "unregistered";
    throw new Error(`FCM antwoordde ${String(res.status)}`);
  }
  throw new Error(`FCM antwoordde ${String(res.status)}`);
}
