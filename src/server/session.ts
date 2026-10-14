import { cookies } from "next/headers";

import { parseCookie, SESSION_COOKIE, verifySession } from "./auth.ts";
import { runtime } from "./runtime.ts";
import { getPasswordHash, getUserById, type User } from "./users.ts";

/** The active user behind a raw `cookie` header value, if the session token is valid. */
export function userFromCookieHeader(
  header: string | undefined,
): User | undefined {
  const { db, secret } = runtime();
  const id = verifySession(
    secret,
    parseCookie(header, SESSION_COOKIE),
    (userId) => getPasswordHash(db, userId),
  );
  const found = id === undefined ? undefined : getUserById(db, id);
  return found?.active ? found : undefined;
}

/** For Server Components and layouts. */
export async function getSessionUser(): Promise<User | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return userFromCookieHeader(
    token === undefined
      ? undefined
      : `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
  );
}
