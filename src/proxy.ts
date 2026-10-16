import { type NextRequest, NextResponse } from "next/server";

import { clientIp, ipVerdict } from "@/server/ips.ts";
import { runtime } from "@/server/runtime.ts";
import { bump, logAccess } from "@/server/stats.ts";

const SESSION_COOKIE = "session";
const PROTECTED = new Set([
  "/watchlist",
  "/catalog",
  "/tweedekans",
  "/alerts",
  "/profile",
  "/trips",
  "/settings",
  "/admin",
]);

const isProtected = (path: string): boolean =>
  PROTECTED.has(path) || path.startsWith("/product/");

/**
 * Runs for every page and API request: enforces the IP block list (an allow rule wins), keeps
 * the traffic log, and sends visitors without a session cookie to the login page.
 */
export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  try {
    const { db } = runtime();
    const ip = clientIp(request);
    if (ipVerdict(db, ip) === "block") {
      bump(db, "blocked_requests");
      logAccess(db, ip, path, "blocked");
      return path.startsWith("/api/")
        ? NextResponse.json({ error: "Toegang geweigerd" }, { status: 403 })
        : new NextResponse("Toegang geweigerd", { status: 403 });
    }
    logAccess(db, ip, path, "req");
  } catch (error) {
    console.error("[proxy]", error);
  }
  if (!isProtected(path) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(path)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, health check and static files (anything with a dot).
  matcher: ["/((?!_next/|healthz|.*\\..*).*)"],
};
