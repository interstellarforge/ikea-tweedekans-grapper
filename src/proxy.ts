import { type NextRequest, NextResponse } from "next/server";

import { config as appConfig } from "@/server/config.ts";
import { classifyUa, clientIp, ipVerdict } from "@/server/ips.ts";
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
    const { db, rateLimiter } = runtime();
    const ip = clientIp(request);
    if (ipVerdict(db, ip) === "block") {
      bump(db, "blocked_requests");
      logAccess(db, ip, path, "blocked");
      return path.startsWith("/api/")
        ? NextResponse.json({ error: "Toegang geweigerd" }, { status: 403 })
        : new NextResponse("Toegang geweigerd", { status: 403 });
    }
    const ua = classifyUa(request);
    if (
      path.startsWith("/api/") &&
      appConfig.apiRateLimitPerMin > 0 &&
      ipVerdict(db, ip) !== "allow" &&
      rateLimiter.exceeded(ip, appConfig.apiRateLimitPerMin)
    ) {
      logAccess(db, ip, path, "limited", ua);
      return NextResponse.json(
        { error: "Te veel verzoeken, probeer het zo opnieuw" },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }
    logAccess(db, ip, path, "req", ua);
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
