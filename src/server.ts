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
  hashPassword,
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
  setTripExcluded,
  upsertStores,
} from "./db.ts";
import {
  type CatalogProduct,
  fetchStores,
  searchCatalog,
} from "./ikea-client.ts";
import {
  addListItem,
  createList,
  deleteList,
  getLists,
  purchaseByArticle,
  recordPieces,
  removeListItem,
  renameList,
  setItemQuantity,
  setItemWatched,
  setListWatched,
  undoPurchase,
} from "./lists.ts";
import {
  listHaNotifyTargets,
  sendEmail,
  sendHa,
  sendNtfy,
  testContent,
} from "./notify.ts";
import { pollAll, pollStatus } from "./poller.ts";
import {
  getSettings,
  saveSettings,
  setRawSetting,
  type SettingsInput,
  toPublic,
} from "./settings.ts";
import { parseShoppingList } from "./shopping-list.ts";
import { computeTrips } from "./trips.ts";
import {
  addWatchItem,
  listAlerts,
  listWatchItems,
  markAlertsSeen,
  removeWatchItem,
  setBought,
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
  "/profile": "profile.html",
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

    if (authed && method === "GET" && path === "/api/profile") {
      send(res, 200, { username: auth.user, authEnabled: auth.enabled });
      return;
    }

    if (authed && method === "PUT" && path === "/api/profile/password") {
      if (!auth.enabled) {
        send(res, 400, { error: "Inloggen staat uit (AUTH_DISABLED)" });
        return;
      }
      const body = await readJson(req);
      const next = str(body["next"]);
      if (!auth.checkCredentials(auth.user, str(body["current"]))) {
        send(res, 400, { error: "Huidig wachtwoord klopt niet" });
        return;
      }
      if (next.length < 8) {
        send(res, 400, { error: "Nieuw wachtwoord: minimaal 8 tekens" });
        return;
      }
      setRawSetting(db, "auth.passwordHash", hashPassword(next));
      // The session is bound to the password: hand this browser a fresh one.
      res.setHeader(
        "set-cookie",
        `${SESSION_COOKIE}=${auth.issueToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`,
      );
      send(res, 200, { ok: true });
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
      if (path === "/list") {
        res.writeHead(302, { location: "/watchlist#boodschappen" });
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
      if (listStores(db).length === 0) {
        for (const country of getSettings(db).countries) {
          upsertStores(db, await fetchStores(country), country);
        }
      }
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

    const excludeMatch = /^\/api\/stores\/(\d+)\/trip-excluded$/.exec(path);
    if (method === "PUT" && excludeMatch?.[1]) {
      const body = await readJson(req);
      setTripExcluded(db, excludeMatch[1], body["excluded"] === true);
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
      if (Array.isArray(body["countries"])) {
        input.countries = body["countries"].filter(
          (c): c is string => typeof c === "string",
        );
      }
      if (typeof body["appUrl"] === "string") input.appUrl = body["appUrl"];
      if (typeof body["homePostcode"] === "string") {
        input.homePostcode = body["homePostcode"];
      }
      if (typeof body["maxStops"] === "number") {
        input.maxStops = body["maxStops"];
      }
      if (typeof body["hourlyRate"] === "number") {
        input.hourlyRate = body["hourlyRate"];
      }
      if (typeof body["stopMinutes"] === "number") {
        input.stopMinutes = body["stopMinutes"];
      }
      if (typeof body["routeAllStores"] === "boolean") {
        input.routeAllStores = body["routeAllStores"];
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
      const h = body["homeAssistant"];
      if (typeof h === "object" && h !== null) {
        const m = h as Record<string, unknown>;
        input.homeAssistant = {};
        if (typeof m["enabled"] === "boolean") {
          input.homeAssistant.enabled = m["enabled"];
        }
        if (typeof m["baseUrl"] === "string") {
          input.homeAssistant.baseUrl = m["baseUrl"];
        }
        if (typeof m["token"] === "string")
          input.homeAssistant.token = m["token"];
        if (Array.isArray(m["targets"])) {
          input.homeAssistant.targets = m["targets"].filter(
            (t): t is string => typeof t === "string",
          );
        }
      }
      const error = saveSettings(db, input);
      if (!error && input.countries) {
        // Make the stores of newly enabled countries visible right away.
        const known = new Set(
          listStores(db, { includeDisabled: true }).map((st) => st.country),
        );
        for (const country of input.countries) {
          if (known.has(country)) continue;
          try {
            upsertStores(db, await fetchStores(country), country);
          } catch (e) {
            console.error(`[settings] store list (${country}) failed:`, e);
          }
        }
      }
      if (error) send(res, 400, { error });
      else send(res, 200, toPublic(getSettings(db)));
      return;
    }

    const testMatch = /^\/api\/notify\/test\/(email|ntfy|ha)$/.exec(path);
    if (method === "POST" && testMatch?.[1]) {
      const settings = getSettings(db);
      try {
        if (testMatch[1] === "email") {
          await sendEmail(
            settings.email,
            "Tweedekans: testmelding",
            "Dit is een testmelding van IKEA Tweedekans. E-mail werkt.",
          );
        } else if (testMatch[1] === "ha") {
          const t = testContent(db, settings.appUrl, "Home Assistant werkt.");
          await sendHa(settings.homeAssistant, t.title, t.body, t.links);
        } else {
          if (!settings.ntfyUrl) throw new Error("Geen ntfy-URL ingesteld");
          const t = testContent(db, settings.appUrl, "ntfy werkt.");
          await sendNtfy(settings.ntfyUrl, t.title, t.body, t.links);
        }
        send(res, 200, { ok: true });
      } catch (error) {
        send(res, 400, {
          error: error instanceof Error ? error.message : "versturen mislukt",
        });
      }
      return;
    }

    if (method === "POST" && path === "/api/ha/targets") {
      const body = await readJson(req);
      const stored = getSettings(db).homeAssistant;
      const baseUrl = (str(body["baseUrl"]) || stored.baseUrl).replace(
        /\/+$/,
        "",
      );
      const token = str(body["token"]) || stored.token;
      try {
        send(res, 200, { targets: await listHaNotifyTargets(baseUrl, token) });
      } catch (error) {
        send(res, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Verbinding met Home Assistant mislukt",
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

    const boughtMatch = /^\/api\/watchlist\/(\d{8})\/bought$/.exec(path);
    if (method === "PUT" && boughtMatch?.[1]) {
      const body = await readJson(req);
      if (typeof body["bought"] !== "number" || !(body["bought"] >= 0)) {
        send(res, 400, { error: "bought must be a number >= 0" });
        return;
      }
      setBought(db, boughtMatch[1], body["bought"]);
      send(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && path === "/api/list/purchase") {
      // From the trip check: tick pieces off on the lists, at the price of that offer.
      const body = await readJson(req);
      const items = Array.isArray(body["items"]) ? body["items"] : [];
      purchaseByArticle(
        db,
        items.flatMap((i: unknown) => {
          const m = i as Record<string, unknown>;
          return typeof m["articleNumber"] === "string" &&
            typeof m["count"] === "number"
            ? [
                {
                  articleNumber: m["articleNumber"],
                  count: m["count"],
                  unitPrice:
                    typeof m["unitPrice"] === "number"
                      ? m["unitPrice"]
                      : undefined,
                  storeName: str(m["storeName"]) || undefined,
                },
              ]
            : [];
        }),
        Date.now(),
      );
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/api/lists") {
      send(res, 200, getLists(db));
      return;
    }

    if (method === "POST" && path === "/api/lists") {
      const body = await readJson(req);
      send(res, 200, { id: createList(db, str(body["name"]), Date.now()) });
      return;
    }

    const listMatch = /^\/api\/lists\/(\d+)$/.exec(path);
    if (listMatch?.[1]) {
      const id = Number(listMatch[1]);
      if (method === "PUT") {
        const body = await readJson(req);
        renameList(db, id, str(body["name"]));
        send(res, 200, { ok: true });
        return;
      }
      if (method === "DELETE") {
        deleteList(db, id);
        send(res, 200, { ok: true });
        return;
      }
    }

    const listWatchAll = /^\/api\/lists\/(\d+)\/watch$/.exec(path);
    if (method === "PUT" && listWatchAll?.[1]) {
      const body = await readJson(req);
      setListWatched(
        db,
        Number(listWatchAll[1]),
        body["watched"] !== false,
        Date.now(),
      );
      send(res, 200, { ok: true });
      return;
    }

    const listItemsMatch = /^\/api\/lists\/(\d+)\/items$/.exec(path);
    if (method === "POST" && listItemsMatch?.[1]) {
      const body = await readJson(req);
      const listId = Number(listItemsMatch[1]);
      const articleNumber = str(body["articleNumber"]);
      if (!/^\d{8}$/.test(articleNumber)) {
        send(res, 400, { error: "invalid articleNumber" });
        return;
      }
      const quantity = Number(body["quantity"]) || 1;
      const mode = body["mode"] === "add" ? "add" : "max";
      let product: CatalogProduct | undefined;
      const given = body["product"] as Record<string, unknown> | undefined;
      if (given && str(given["name"])) {
        product = {
          articleNumber,
          name: str(given["name"]),
          typeName: str(given["typeName"]),
          measure: str(given["measure"]),
          image: str(given["image"]) || undefined,
          url: str(given["url"]) || undefined,
          price:
            typeof given["price"] === "number" ? given["price"] : undefined,
        };
      } else {
        try {
          product = (await searchCatalog(articleNumber)).find(
            (p) => p.articleNumber === articleNumber,
          );
        } catch {
          product = undefined;
        }
      }
      const fallback = offerProductInfo(db, articleNumber);
      const result = addListItem(
        db,
        listId,
        {
          articleNumber,
          name: product?.name ?? fallback?.title ?? articleNumber,
          typeName: product?.typeName ?? fallback?.description ?? "",
          measure: product?.measure ?? "",
          image: product?.image ?? fallback?.image,
          url: product?.url,
          normalPrice: product?.price,
        },
        quantity,
        mode,
        Date.now(),
      );
      send(res, 200, {
        status:
          !product && !fallback && result === "added" ? "unknown" : result,
        name: product
          ? `${product.name} ${product.typeName}`.trim()
          : (fallback?.title ?? articleNumber),
      });
      return;
    }

    const itemMatch2 = /^\/api\/list-items\/(\d+)$/.exec(path);
    if (itemMatch2?.[1]) {
      const id = Number(itemMatch2[1]);
      if (method === "PUT") {
        const body = await readJson(req);
        if (typeof body["quantity"] === "number") {
          setItemQuantity(db, id, body["quantity"]);
        }
        send(res, 200, { ok: true });
        return;
      }
      if (method === "DELETE") {
        removeListItem(db, id);
        send(res, 200, { ok: true });
        return;
      }
    }

    const itemPurchase = /^\/api\/list-items\/(\d+)\/purchase$/.exec(path);
    if (method === "POST" && itemPurchase?.[1]) {
      const body = await readJson(req);
      const pieces = Array.isArray(body["pieces"]) ? body["pieces"] : [];
      const prices = pieces.map((p: unknown) =>
        typeof p === "number" ? p : undefined,
      );
      const count = recordPieces(
        db,
        Number(itemPurchase[1]),
        prices,
        str(body["storeName"]) || undefined,
        Date.now(),
      );
      send(res, 200, { recorded: count });
      return;
    }

    const itemWatch = /^\/api\/list-items\/(\d+)\/watch$/.exec(path);
    if (method === "PUT" && itemWatch?.[1]) {
      const body = await readJson(req);
      setItemWatched(
        db,
        Number(itemWatch[1]),
        body["watched"] !== false,
        Date.now(),
      );
      send(res, 200, { ok: true });
      return;
    }

    const purchaseMatch = /^\/api\/purchases\/(\d+)$/.exec(path);
    if (method === "DELETE" && purchaseMatch?.[1]) {
      undoPurchase(db, Number(purchaseMatch[1]));
      send(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && path === "/api/list/parse") {
      const body = await readJson(req);
      const items = parseShoppingList(str(body["text"])).slice(0, 200);
      send(res, 200, { items });
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
