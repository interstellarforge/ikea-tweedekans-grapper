import Constants from "expo-constants";

import { readValue } from "@/lib/storage.ts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Listener = () => void;

const DEFAULT_URL =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "https://tweedekanshoek.nl";

let unauthorized: Listener | undefined;

/** Called when the server rejects the stored token (revoked or password changed). */
export function onUnauthorized(listener: Listener): void {
  unauthorized = listener;
}

export const normalizeServerUrl = (url: string): string =>
  url.trim().replace(/\/+$/, "");

export async function serverUrl(): Promise<string> {
  return normalizeServerUrl((await readValue("serverUrl")) ?? DEFAULT_URL);
}

export const defaultServerUrl = (): string => DEFAULT_URL;

type ErrorBody = { error?: string };

export async function api<T>(
  path: string,
  init: RequestInit & { token?: string; baseUrl?: string } = {},
): Promise<T> {
  const { token: explicit, baseUrl, ...rest } = init;
  const token = explicit ?? (await readValue("token"));
  const headers = new Headers(rest.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl ?? (await serverUrl())}${path}`, {
    ...rest,
    headers: headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & ErrorBody;
  if (response.status === 401 && explicit === undefined) unauthorized?.();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error ?? `HTTP ${String(response.status)}`,
    );
  }
  return data;
}

export const send = <T = { ok: true }>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> =>
  api<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Er ging iets mis";
