import { z } from "zod";

import { issueSession, SESSION_COOKIE, SESSION_TTL_MS } from "./auth.ts";
import { config } from "./config.ts";
import type { Ctx, Db } from "./db.ts";
import { runtime } from "./runtime.ts";
import { userFromCookieHeader } from "./session.ts";
import { getUserSettings, type UserSettings } from "./settings.ts";
import { getPasswordHash, type User } from "./users.ts";

export type ApiContext = {
  request: Request;
  url: URL;
  db: Db;
  user: User;
  ctx: Ctx;
  settings: UserSettings;
  params: Record<string, string>;
  /** Parses the JSON body against a schema; a mismatch becomes a 400. */
  body: <T extends z.ZodType>(schema: T) => Promise<z.infer<T>>;
  /** Hands this browser a fresh session cookie (used after a password change). */
  startSession: () => void;
};

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (api: ApiContext) => unknown;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
};

export const reply = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  Response.json(data, { status, headers: { ...SECURITY_HEADERS, ...headers } });

const isSecure = (request: Request): boolean =>
  request.headers.get("x-forwarded-proto") === "https" ||
  config.appUrl.startsWith("https://");

export const sessionCookie = (
  request: Request,
  value: string,
  maxAgeSeconds: number,
): string =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAgeSeconds)}${isSecure(request) ? "; Secure" : ""}`;

export const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

/** The signed-in, active user behind this request, if any. */
export const currentUser = (request: Request): User | undefined =>
  userFromCookieHeader(request.headers.get("cookie") ?? undefined);

export function newSessionCookie(request: Request, user: User): string {
  const { db, secret } = runtime();
  const hash = getPasswordHash(db, user.id) ?? "";
  return sessionCookie(
    request,
    issueSession(secret, user.id, hash),
    SESSION_TTL_MS / 1000,
  );
}

async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new HttpError(400, "Ongeldige invoer");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Ongeldige invoer");
  return parsed.data;
}

function toResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return reply({ error: error.message }, error.status);
  }
  console.error(error);
  return reply(
    { error: error instanceof Error ? error.message : "upstream error" },
    502,
  );
}

/**
 * Wraps a route handler: requires a signed-in user (and admin when asked), resolves the
 * per-user context and turns thrown errors into JSON.
 */
export function authed(
  handler: Handler,
  options: { admin?: boolean } = {},
): (request: Request, route: RouteContext) => Promise<Response> {
  return async (request, route) => {
    try {
      const user = currentUser(request);
      if (!user) return reply({ error: "Niet ingelogd" }, 401);
      if (options.admin === true && user.role !== "admin") {
        return reply({ error: "Alleen voor beheerders" }, 403);
      }
      const { db } = runtime();
      const settings = getUserSettings(db, user.id);
      let cookie: string | undefined;
      const result = await handler({
        request,
        url: new URL(request.url),
        db,
        user,
        ctx: { userId: user.id, countries: settings.countries },
        settings,
        params: await route.params,
        body: (schema) => readBody(request.clone(), schema),
        startSession: () => {
          cookie = newSessionCookie(request, user);
        },
      });
      if (result instanceof Response) return result;
      return reply(result, 200, cookie ? { "set-cookie": cookie } : {});
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** Same wrapper for public endpoints (no session needed). */
export function open(
  handler: (request: Request, db: Db) => unknown,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const result = await handler(request, runtime().db);
      return result instanceof Response ? result : reply(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

export const ok = { ok: true } as const;
