import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "session";

/** Sends visitors without a session cookie to the login page, remembering where they wanted to go. */
export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/watchlist",
    "/catalog",
    "/tweedekans",
    "/alerts",
    "/profile",
    "/trips",
    "/settings",
    "/admin",
    "/product/:article*",
  ],
};
