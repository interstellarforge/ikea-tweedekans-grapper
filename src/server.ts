import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { DatabaseSync } from "node:sqlite";

import {
  type Auth,
  parseCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./auth.ts";
import {
  articleInsights,
  listStores,
  offerProductInfo,
  priceHistory,
  searchOffers,
  setFollowed,
  upsertStores,
} from "./db.ts";
import {
  type CatalogProduct,
  fetchStores,
  searchCatalog,
} from "./ikea-client.ts";
import { alertLinks, sendEmail, sendNtfy } from "./notify.ts";
import { pollAll, pollStatus } from "./poller.ts";
import {
  getSettings,
  saveSettings,
  type SettingsInput,
  toPublic,
} from "./settings.ts";
import { computeTrips } from "./trips.ts";
import {
  addWatchItem,
  listAlerts,
  listWatchItems,
  markAlertsSeen,
  removeWatchItem,
  setQuantity,
} from "./watchlist.ts";

const readUi = (name: string): string =>
  readFileSync(new URL(`./ui/${name}`, import.meta.url), "utf8");

/** Content hash of the shared assets; appended to asset URLs so proxies/browsers never serve stale copies. */
const ASSET_VERSION = createHash("sha256")
  .update(readUi("app.js"))
  .update(readUi("app.css"))
  .digest("hex")
  .slice(0, 12);

const uiFile = (name: string): string => {
  const content = readUi(name);
  return name.endsWith(".html")
    ? content
        .replace(
          'src="/assets/app.js"',
          `src="/assets/app.js?v=${ASSET_VERSION}"`,
        )
        .replace(
          'href="/assets/app.css"',
          `href="/assets/app.css?v=${ASSET_VERSION}"`,
        )
    : content;
};

const PAGES: Record<string, string> = {
  "/watchlist": "watchlist.html",
  "/catalog": "catalog.html",
  "/tweedekans": "tweedekans.html",
  "/alerts": "alerts.html",
  "/trips": "trips.html",
  "/settings": "settings.html",
};

const PRODUCT_PAGE = "product.html";

const ASSETS: Record<string, { file: string; type: string }> = {
  "/assets/app.js": { file: "app.js", type: "text/javascript" },
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: string | null): number | undefined =>
  v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const parsed: unknown = JSON.parse(
    Buffer.concat(chunks).toString("utf8") || "{}",
  );
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  type = "application/json",
): undefined {
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
  });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
  return undefined;
}

export function createApp(db: DatabaseSync, auth: Auth): Server {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const path = url.pathname;
    const clientIp = (
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0] ??
      req.socket.remoteAddress ??
      "unknown"
    ).trim();
    const secure = req.headers["x-forwarded-proto"] === "https";
    const authed = auth.verifyToken(
      parseCookie(req.headers.cookie, SESSION_COOKIE),
    );

    if (method === "GET" && path === "/healthz") {
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/login") {
      if (authed) {
        res.writeHead(302, { location: "/" });
        res.end();
        return;
      }
      send(res, 200, uiFile("login.html"), "text/html");
      return;
    }

    if (method === "GET" && path === "/assets/app.css") {
      send(res, 200, uiFile("app.css"), "text/css");
      return;
    }

    if (method === "POST" && path === "/api/login") {
      if (auth.isLocked(clientIp)) {
        send(res, 429, {
          error: "Te veel pogingen, probeer het over 15 minuten opnieuw",
        });
        return;
      }
      const body = await readJson(req);
      if (auth.checkCredentials(str(body["username"]), str(body["password"]))) {
        auth.clearFailures(clientIp);
        res.setHeader(
          "set-cookie",
          `${SESSION_COOKIE}=${auth.issueToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`,
        );
        send(res, 200, { ok: true });
      } else {
        auth.recordFailure(clientIp);
        await new Promise((r) => setTimeout(r, 600));
        send(res, 401, { error: "Onjuiste gebruikersnaam of wachtwoord" });
      }
      return;
    }

    if (method === "POST" && path === "/api/logout") {
      res.setHeader(
        "set-cookie",
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`,
      );
      send(res, 200, { ok: true });
      return;
    }

    if (!authed) {
      if (method === "GET" && !path.startsWith("/api/")) {
        const next = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
        res.writeHead(302, { location: `/login${next}` });
        res.end();
        return;
      }
      send(res, 401, { error: "Niet ingelogd" });
      return;
    }

    if (method === "GET") {
      if (path === "/") {
        res.writeHead(302, { location: "/watchlist" });
        res.end();
        return;
      }
      const page = /^\/product\/\d{8}$/.test(path) ? PRODUCT_PAGE : PAGES[path];
      if (page) {
        send(res, 200, uiFile(page), "text/html");
        return;
      }
      const asset = ASSETS[path];
      if (asset) {
        send(res, 200, uiFile(asset.file), asset.type);
        return;
      }
    }

    if (method === "GET" && path === "/api/stores") {
      if (listStores(db).length === 0) upsertStores(db, await fetchStores());
      send(res, 200, listStores(db));
      return;
    }

    const followMatch = /^\/api\/stores\/(\d+)\/followed$/.exec(path);
    if (method === "PUT" && followMatch?.[1]) {
      const body = await readJson(req);
      setFollowed(db, followMatch[1], body["followed"] === true);
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/api/settings") {
      send(res, 200, toPublic(getSettings(db)));
      return;
    }

    if (method === "PUT" && path === "/api/settings") {
      const body = await readJson(req);
      const input: SettingsInput = {};
      if (typeof body["pollIntervalMin"] === "number") {
        input.pollIntervalMin = body["pollIntervalMin"];
      }
      if (typeof body["ntfyUrl"] === "string") input.ntfyUrl = body["ntfyUrl"];
      if (typeof body["appUrl"] === "string") input.appUrl = body["appUrl"];
      if (typeof body["homePostcode"] === "string") {
        input.homePostcode = body["homePostcode"];
      }
      if (typeof body["fuelPrice"] === "number") {
        input.fuelPrice = body["fuelPrice"];
      }
      if (typeof body["consumptionPer100km"] === "number") {
        input.consumptionPer100km = body["consumptionPer100km"];
      }
      const e = body["email"];
      if (typeof e === "object" && e !== null) {
        const m = e as Record<string, unknown>;
        input.email = {};
        if (typeof m["enabled"] === "boolean")
          input.email.enabled = m["enabled"];
        if (typeof m["secure"] === "boolean") input.email.secure = m["secure"];
        if (typeof m["port"] === "number") input.email.port = m["port"];
        for (const k of ["host", "user", "password", "from", "to"] as const) {
          if (typeof m[k] === "string") input.email[k] = m[k];
        }
      }
      const error = saveSettings(db, input);
      if (error) send(res, 400, { error });
      else send(res, 200, toPublic(getSettings(db)));
      return;
    }

    const testMatch = /^\/api\/notify\/test\/(email|ntfy)$/.exec(path);
    if (method === "POST" && testMatch?.[1]) {
      const settings = getSettings(db);
      try {
        if (testMatch[1] === "email") {
          await sendEmail(
            settings.email,
            "Tweedekans: testmelding",
            "Dit is een testmelding van IKEA Tweedekans. E-mail werkt.",
          );
        } else {
          if (!settings.ntfyUrl) throw new Error("Geen ntfy-URL ingesteld");
          await sendNtfy(
            settings.ntfyUrl,
            "Tweedekans: testmelding",
            "ntfy werkt. Tik om de meldingenpagina te openen.",
            alertLinks(settings.appUrl),
          );
        }
        send(res, 200, { ok: true });
      } catch (error) {
        send(res, 400, {
          error: error instanceof Error ? error.message : "versturen mislukt",
        });
      }
      return;
    }

    if (method === "GET" && path === "/api/status") {
      send(res, 200, pollStatus);
      return;
    }

    if (method === "POST" && path === "/api/sync") {
      void pollAll(db);
      send(res, 202, { running: true });
      return;
    }

    if (method === "GET" && path === "/api/catalog") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) {
        send(res, 200, []);
        return;
      }
      const products = await searchCatalog(q);
      const insights = articleInsights(
        db,
        products.map((p) => p.articleNumber),
      );
      const watched = new Set(listWatchItems(db).map((w) => w.articleNumber));
      send(
        res,
        200,
        products.map((p) => ({
          ...p,
          watched: watched.has(p.articleNumber),
          insight: insights[p.articleNumber],
        })),
      );
      return;
    }

    const productMatch = /^\/api\/product\/(\d{8})$/.exec(path);
    if (method === "GET" && productMatch?.[1]) {
      const articleNumber = productMatch[1];
      let product: CatalogProduct | undefined;
      try {
        product = (await searchCatalog(articleNumber)).find(
          (p) => p.articleNumber === articleNumber,
        );
      } catch (error) {
        console.error("[product] catalog lookup failed:", error);
      }
      const fallback = offerProductInfo(db, articleNumber);
      if (!product && !fallback) {
        send(res, 404, { error: "unknown product" });
        return;
      }
      send(res, 200, {
        articleNumber,
        name: product?.name ?? fallback?.title ?? articleNumber,
        typeName: product?.typeName ?? fallback?.description ?? "",
        measure: product?.measure ?? "",
        image: product?.image ?? fallback?.image,
        url: product?.url,
        watched: listWatchItems(db).some(
          (w) => w.articleNumber === articleNumber,
        ),
        insight: articleInsights(db, [articleNumber])[articleNumber],
        history: priceHistory(db, articleNumber),
      });
      return;
    }

    if (method === "GET" && path === "/api/watchlist") {
      const items = listWatchItems(db);
      const insights = articleInsights(
        db,
        items.map((i) => i.articleNumber),
      );
      send(
        res,
        200,
        items.map((i) => ({ ...i, insight: insights[i.articleNumber] })),
      );
      return;
    }

    if (method === "PUT" && path === "/api/watchlist") {
      const body = await readJson(req);
      const articleNumber = str(body["articleNumber"]);
      if (!/^\d{8}$/.test(articleNumber)) {
        send(res, 400, { error: "invalid articleNumber" });
        return;
      }
      addWatchItem(
        db,
        {
          articleNumber,
          name: str(body["name"]),
          typeName: str(body["typeName"]),
          measure: str(body["measure"]),
          image: str(body["image"]) || undefined,
          url: str(body["url"]) || undefined,
        },
        Date.now(),
      );
      send(res, 200, { ok: true });
      return;
    }

    const qtyMatch = /^\/api\/watchlist\/(\d{8})\/quantity$/.exec(path);
    if (method === "PUT" && qtyMatch?.[1]) {
      const body = await readJson(req);
      if (typeof body["quantity"] !== "number" || !(body["quantity"] >= 1)) {
        send(res, 400, { error: "quantity must be a number >= 1" });
        return;
      }
      setQuantity(db, qtyMatch[1], body["quantity"]);
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/api/trips") {
      send(res, 200, await computeTrips(db));
      return;
    }

    const itemMatch = /^\/api\/watchlist\/(\d{8})$/.exec(path);
    if (method === "DELETE" && itemMatch?.[1]) {
      removeWatchItem(db, itemMatch[1]);
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/api/alerts") {
      send(
        res,
        200,
        listAlerts(
          db,
          num(url.searchParams.get("limit")),
          num(url.searchParams.get("offset")),
        ),
      );
      return;
    }

    if (method === "POST" && path === "/api/alerts/seen") {
      markAlertsSeen(db);
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/api/offers") {
      const hours = num(url.searchParams.get("newHours"));
      const sort = url.searchParams.get("sort");
      const scopeParam = url.searchParams.get("followed");
      send(
        res,
        200,
        searchOffers(db, {
          q: url.searchParams.get("q") ?? undefined,
          storeId: str(url.searchParams.get("store")) || undefined,
          scope:
            scopeParam === "1"
              ? "followed"
              : scopeParam === "0"
                ? "others"
                : undefined,
          sinceMs: hours ? Date.now() - hours * 3_600_000 : undefined,
          sort:
            sort === "priceAsc" || sort === "priceDesc" || sort === "discount"
              ? sort
              : "new",
          limit: num(url.searchParams.get("limit")),
          offset: num(url.searchParams.get("offset")),
        }),
      );
      return;
    }

    send(res, 404, { error: "not found" });
  };

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      send(res, 502, {
        error: error instanceof Error ? error.message : "upstream error",
      });
    });
  });
}
