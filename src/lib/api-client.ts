export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type ErrorBody = { error?: string };

/** JSON fetch against our own API; a 401 sends the visitor to the login page. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
    throw new ApiError(401, "Niet ingelogd");
  }
  const data = (await response.json().catch(() => ({}))) as T & ErrorBody;
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
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Er ging iets mis";
