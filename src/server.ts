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
  issueSession,
  LoginLimiter,
  parseCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifySession,
} from "./auth.ts";
import { config } from "./config.ts";
import { COUNTRY_CODES } from "./countries.ts";
import {
  articleInsights,
  type Ctx,
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
  ownsItem,
  ownsList,
  ownsPurchase,
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
  type ChannelName,
  channelStatus,
  deliver,
  listHaNotifyTargets,
  ntfyUrlFor,
  sendEmail,
  testContent,
} from "./notify.ts";
import { pollAll, pollStatus } from "./poller.ts";
import {
  getGlobalSettings,
  getUserSettings,
  type GlobalSettingsInput,
  saveGlobalSettings,
  saveUserSettings,
  toPublicGlobal,
  toPublicUser,
  type UserSettingsInput,
} from "./settings.ts";
import { parseShoppingList } from "./shopping-list.ts";
import { computeTrips } from "./trips.ts";
import {
  checkLogin,
  countUsers,
  createUser,
  deleteUser,
  getPasswordHash,
  getUserById,
  isValidEmail,
  listUsers,
  normalizeEmail,
  setPassword,
  touchLogin,
  updateUser,
  type User,
} from "./users.ts";
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

let refreshingPrices = false;

/** Fetches the regular price from IKEA's catalog for list items that have none yet (background). */
function refreshListPrices(db: DatabaseSync): void {
  if (refreshingPrices) return;
  const missing = db
    .prepare(
      "SELECT DISTINCT article_number AS article FROM list_items WHERE normal_price IS NULL LIMIT 8",
    )
    .all() as { article: string }[];
  if (missing.length === 0) return;
  refreshingPrices = true;
  void Promise.allSettled(
    missing.map(async ({ article }) => {
      const found = (await searchCatalog(article)).find(
        (p) => p.articleNumber === article,
      );
      if (found?.price !== undefined) {
        db.prepare(
          "UPDATE list_items SET normal_price = ? WHERE article_number = ?",
        ).run(found.price, article);
      }
    }),
  ).finally(() => {
    refreshingPrices = false;
  });
}

const sessionCookie = (
  value: string,
  maxAge: number,
  secure: boolean,
): string =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}${secure ? "; Secure" : ""}`;

const CHANNEL_PARAM: Record<string, ChannelName> = {
  ntfy: "ntfy",
  email: "email",
  ha: "homeAssistant",
};

export function createApp(db: DatabaseSync, secret: Buffer): Server {
  const limiter = new LoginLimiter();

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const path = url.pathname;
    const clientIp = (
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0] ??
      req.socket.remoteAddress ??
      "unknown"
    ).trim();
    const secure =
      req.headers["x-forwarded-proto"] === "https" ||
      config.appUrl.startsWith("https://");

    const sessionUserId = verifySession(
      secret,
      parseCookie(req.headers.cookie, SESSION_COOKIE),
      (id) => getPasswordHash(db, id),
    );
    const found =
      sessionUserId === undefined ? undefined : getUserById(db, sessionUserId);
    const user: User | undefined = found?.active ? found : undefined;

    const startSession = (u: User): void => {
      const hash = getPasswordHash(db, u.id) ?? "";
      res.setHeader(
        "set-cookie",
        sessionCookie(
          issueSession(secret, u.id, hash),
          SESSION_TTL_MS / 1000,
          secure,
        ),
      );
    };

    // ------------------------------------------------------------ public
    if (method === "GET" && path === "/healthz") {
      send(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/assets/app.css") {
      send(res, 200, uiFile("app.css"), "text/css");
      return;
    }

    if (method === "GET" && path === "/login") {
      if (user) {
        res.writeHead(302, { location: "/" });
        res.end();
        return;
      }
      send(res, 200, uiFile("login.html"), "text/html");
      return;
    }

    if (method === "GET" && path === "/api/auth/config") {
      const first = countUsers(db) === 0;
      send(res, 200, {
        registrationOpen: first || getGlobalSettings(db).registrationOpen,
        firstAccount: first,
      });
      return;
    }

    if (method === "POST" && path === "/api/login") {
      if (limiter.isLocked(clientIp)) {
        send(res, 429, {
          error: "Te veel pogingen, probeer het over 15 minuten opnieuw",
        });
        return;
      }
      const body = await readJson(req);
      const ok = checkLogin(db, str(body["email"]), str(body["password"]));
      if (ok) {
        limiter.clear(clientIp);
        touchLogin(db, ok.id, Date.now());
        startSession(ok);
        send(res, 200, { ok: true });
      } else {
        limiter.recordFailure(clientIp);
        await new Promise((r) => setTimeout(r, 600));
        send(res, 401, { error: "Onjuist e-mailadres of wachtwoord" });
      }
      return;
    }

    if (method === "POST" && path === "/api/register") {
      if (limiter.isLocked(clientIp)) {
        send(res, 429, {
          error: "Te veel pogingen, probeer het later opnieuw",
        });
        return;
      }
      const body = await readJson(req);
      const email = normalizeEmail(str(body["email"]));
      const password = str(body["password"]);
      const first = countUsers(db) === 0;
      if (!first && !getGlobalSettings(db).registrationOpen) {
        send(res, 403, { error: "Registreren is uitgeschakeld" });
        return;
      }
      if (first && config.adminEmail && email !== config.adminEmail) {
        send(res, 403, {
          error: "Het eerste account moet het beheerders-e-mailadres zijn",
        });
        return;
      }
      if (!isValidEmail(email)) {
        send(res, 400, { error: "Vul een geldig e-mailadres in" });
        return;
      }
      if (password.length < 8) {
        send(res, 400, { error: "Wachtwoord: minimaal 8 tekens" });
        return;
      }
      try {
        const created = createUser(db, { email, password });
        touchLogin(db, created.id, Date.now());
        startSession(created);
        send(res, 200, { ok: true });
      } catch (error) {
        const exists = error instanceof Error && /UNIQUE/i.test(error.message);
        limiter.recordFailure(clientIp);
        send(res, exists ? 409 : 500, {
          error: exists
            ? "Dit e-mailadres is al in gebruik"
            : "Account maken mislukt",
        });
      }
      return;
    }

    if (method === "POST" && path === "/api/logout") {
      res.setHeader("set-cookie", sessionCookie("", 0, secure));
      send(res, 200, { ok: true });
      return;
    }

    // ------------------------------------------------------------ everything below needs a login
    if (!user) {
      if (method === "GET" && !path.startsWith("/api/")) {
        const next = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
        res.writeHead(302, { location: `/login${next}` });
        res.end();
        return;
      }
      send(res, 401, { error: "Niet ingelogd" });
      return;
    }

    const settings = getUserSettings(db, user.id);
    const ctx: Ctx = { userId: user.id, countries: settings.countries };
    const isAdmin = user.role === "admin";

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
      if (path === "/admin") {
        if (!isAdmin) {
          res.writeHead(302, { location: "/watchlist" });
          res.end();
          return;
        }
        send(res, 200, uiFile("admin.html"), "text/html");
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

    // ------------------------------------------------------------ profile
    if (method === "GET" && (path === "/api/profile" || path === "/api/me")) {
      send(res, 200, {
        id: user.id,
        email: user.email,
        username: user.email,
        role: user.role,
      });
      return;
    }

    if (method === "PUT" && path === "/api/profile/password") {
      const body = await readJson(req);
      const next = str(body["next"]);
      if (!checkLogin(db, user.email, str(body["current"]))) {
        send(res, 400, { error: "Huidig wachtwoord klopt niet" });
        return;
      }
      if (next.length < 8) {
        send(res, 400, { error: "Nieuw wachtwoord: minimaal 8 tekens" });
        return;
      }
      setPassword(db, user.id, next);
      // The session is bound to the password: hand this browser a fresh one.
      startSession(user);
      send(res, 200, { ok: true });
      return;
    }

    // ------------------------------------------------------------ admin
    if (path.startsWith("/api/admin/")) {
      if (!isAdmin) {
        send(res, 403, { error: "Alleen voor beheerders" });
        return;
      }

      if (method === "GET" && path === "/api/admin/users") {
        send(
          res,
          200,
          listUsers(db).map((u) => ({
            id: u.id,
            email: u.email,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin,
          })),
        );
        return;
      }

      const adminUser = /^\/api\/admin\/users\/(\d+)$/.exec(path);
      if (adminUser?.[1]) {
        const id = Number(adminUser[1]);
        if (method === "PUT") {
          const body = await readJson(req);
          if (id === user.id && body["active"] === false) {
            send(res, 400, { error: "Je kunt jezelf niet deactiveren" });
            return;
          }
          const changes: { role?: "user" | "admin"; active?: boolean } = {};
          if (body["role"] === "admin" || body["role"] === "user") {
            changes.role = body["role"];
          }
          if (typeof body["active"] === "boolean")
            changes.active = body["active"];
          const error = updateUser(db, id, changes);
          if (error) send(res, 400, { error });
          else send(res, 200, { ok: true });
          return;
        }
        if (method === "DELETE") {
          if (id === user.id) {
            send(res, 400, { error: "Je kunt jezelf niet verwijderen" });
            return;
          }
          const error = deleteUser(db, id);
          if (error) send(res, 400, { error });
          else send(res, 200, { ok: true });
          return;
        }
      }

      const adminPw = /^\/api\/admin\/users\/(\d+)\/password$/.exec(path);
      if (method === "POST" && adminPw?.[1]) {
        const body = await readJson(req);
        const password = str(body["password"]);
        if (password.length < 8) {
          send(res, 400, { error: "Wachtwoord: minimaal 8 tekens" });
          return;
        }
        if (!getUserById(db, Number(adminPw[1]))) {
          send(res, 404, { error: "Gebruiker niet gevonden" });
          return;
        }
        setPassword(db, Number(adminPw[1]), password);
        send(res, 200, { ok: true });
        return;
      }

      if (method === "GET" && path === "/api/admin/settings") {
        send(res, 200, toPublicGlobal(getGlobalSettings(db)));
        return;
      }

      if (method === "PUT" && path === "/api/admin/settings") {
        const body = await readJson(req);
        const input: GlobalSettingsInput = {};
        if (typeof body["pollIntervalMin"] === "number") {
          input.pollIntervalMin = body["pollIntervalMin"];
        }
        if (typeof body["registrationOpen"] === "boolean") {
          input.registrationOpen = body["registrationOpen"];
        }
        const ch = body["channels"];
        if (typeof ch === "object" && ch !== null) {
          const m = ch as Record<string, unknown>;
          input.channels = {};
          for (const k of ["ntfy", "email", "homeAssistant"] as const) {
            if (typeof m[k] === "boolean") input.channels[k] = m[k];
          }
        }
        const sm = body["smtp"];
        if (typeof sm === "object" && sm !== null) {
          const m = sm as Record<string, unknown>;
          input.smtp = {};
          if (typeof m["port"] === "number") input.smtp.port = m["port"];
          if (typeof m["secure"] === "boolean") input.smtp.secure = m["secure"];
          for (const k of ["host", "user", "password", "from"] as const) {
            if (typeof m[k] === "string") input.smtp[k] = m[k];
          }
        }
        const error = saveGlobalSettings(db, input);
        if (error) send(res, 400, { error });
        else send(res, 200, toPublicGlobal(getGlobalSettings(db)));
        return;
      }

      if (method === "POST" && path === "/api/admin/smtp-test") {
        try {
          await sendEmail(
            getGlobalSettings(db).smtp,
            user.email,
            "Tweedekans: SMTP-test",
            "De SMTP-instellingen werken.",
          );
          send(res, 200, { ok: true });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : "versturen mislukt",
          });
        }
        return;
      }

      if (method === "GET" && path === "/api/admin/status") {
        send(res, 200, { ...pollStatus, stores: listStores(db) });
        return;
      }

      if (method === "POST" && path === "/api/admin/sync") {
        void pollAll(db);
        send(res, 202, { running: true });
        return;
      }

      send(res, 404, { error: "not found" });
      return;
    }

    // ------------------------------------------------------------ settings (personal)
    if (method === "GET" && path === "/api/settings") {
      send(res, 200, {
        ...toPublicUser(settings),
        channels: channelStatus(db, user),
        ntfyUrl: ntfyUrlFor(user) ?? "",
        email: user.email,
      });
      return;
    }

    if (method === "PUT" && path === "/api/settings") {
      const body = await readJson(req);
      const input: UserSettingsInput = {};
      if (Array.isArray(body["countries"])) {
        input.countries = body["countries"].filter(
          (c): c is string =>
            typeof c === "string" && COUNTRY_CODES.includes(c as never),
        );
      }
      if (typeof body["homePostcode"] === "string") {
        input.homePostcode = body["homePostcode"];
      }
      for (const key of [
        "maxStops",
        "maxTripMinutes",
        "hourlyRate",
        "stopMinutes",
        "fuelPrice",
        "consumptionPer100km",
      ] as const) {
        const v = body[key];
        if (typeof v === "number") input[key] = v;
      }
      if (typeof body["routeAllStores"] === "boolean") {
        input.routeAllStores = body["routeAllStores"];
      }
      const n = body["notify"];
      if (typeof n === "object" && n !== null) {
        const m = n as Record<string, unknown>;
        input.notify = {};
        for (const k of ["ntfy", "email", "homeAssistant"] as const) {
          if (typeof m[k] === "boolean") input.notify[k] = m[k];
        }
      }
      const h = body["homeAssistant"];
      if (typeof h === "object" && h !== null) {
        const m = h as Record<string, unknown>;
        input.homeAssistant = {};
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
      const error = saveUserSettings(db, user.id, input);
      if (error) {
        send(res, 400, { error });
        return;
      }
      const saved = getUserSettings(db, user.id);
      send(res, 200, {
        ...toPublicUser(saved),
        channels: channelStatus(db, user),
        ntfyUrl: ntfyUrlFor(user) ?? "",
        email: user.email,
      });
      return;
    }

    const testMatch = /^\/api\/notify\/test\/(email|ntfy|ha)$/.exec(path);
    if (method === "POST" && testMatch?.[1]) {
      const channel = CHANNEL_PARAM[testMatch[1]];
      try {
        const msg = testContent(db, ctx, "Testmelding van IKEA Tweedekans.");
        await deliver(db, user, msg, channel);
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
      const stored = settings.homeAssistant;
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

    // ------------------------------------------------------------ stores
    if (method === "GET" && path === "/api/stores") {
      if (listStores(db).length === 0) {
        for (const country of COUNTRY_CODES) {
          try {
            upsertStores(db, await fetchStores(country), country);
          } catch (error) {
            console.error(`[stores] list (${country}) failed:`, error);
          }
        }
      }
      send(res, 200, listStores(db, ctx));
      return;
    }

    const followMatch = /^\/api\/stores\/(\d+)\/followed$/.exec(path);
    if (method === "PUT" && followMatch?.[1]) {
      const body = await readJson(req);
      setFollowed(db, user.id, followMatch[1], body["followed"] === true);
      send(res, 200, { ok: true });
      return;
    }

    const excludeMatch = /^\/api\/stores\/(\d+)\/trip-excluded$/.exec(path);
    if (method === "PUT" && excludeMatch?.[1]) {
      const body = await readJson(req);
      setTripExcluded(db, user.id, excludeMatch[1], body["excluded"] === true);
      send(res, 200, { ok: true });
      return;
    }

    // ------------------------------------------------------------ catalog + product
    if (method === "GET" && path === "/api/catalog") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) {
        send(res, 200, []);
        return;
      }
      const products = await searchCatalog(q);
      const insights = articleInsights(
        db,
        ctx,
        products.map((p) => p.articleNumber),
      );
      const watched = new Set(
        listWatchItems(db, user.id, ctx.countries).map((w) => w.articleNumber),
      );
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
        watched: listWatchItems(db, user.id, ctx.countries).some(
          (w) => w.articleNumber === articleNumber,
        ),
        insight: articleInsights(db, ctx, [articleNumber])[articleNumber],
        history: priceHistory(db, articleNumber),
      });
      return;
    }

    // ------------------------------------------------------------ watchlist
    if (method === "GET" && path === "/api/watchlist") {
      const items = listWatchItems(db, user.id, ctx.countries);
      const insights = articleInsights(
        db,
        ctx,
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
        user.id,
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
      setQuantity(db, user.id, qtyMatch[1], body["quantity"]);
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
      setBought(db, user.id, boughtMatch[1], body["bought"]);
      send(res, 200, { ok: true });
      return;
    }

    const itemMatch = /^\/api\/watchlist\/(\d{8})$/.exec(path);
    if (method === "DELETE" && itemMatch?.[1]) {
      removeWatchItem(db, user.id, itemMatch[1]);
      send(res, 200, { ok: true });
      return;
    }

    // ------------------------------------------------------------ shopping lists
    if (method === "POST" && path === "/api/list/purchase") {
      // From the trip check: tick pieces off on the lists, at the price of that offer.
      const body = await readJson(req);
      const items = Array.isArray(body["items"]) ? body["items"] : [];
      purchaseByArticle(
        db,
        user.id,
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
      send(res, 200, getLists(db, user.id, ctx.countries));
      refreshListPrices(db);
      return;
    }

    if (method === "POST" && path === "/api/lists") {
      const body = await readJson(req);
      send(res, 200, {
        id: createList(db, user.id, str(body["name"]), Date.now()),
      });
      return;
    }

    const listMatch = /^\/api\/lists\/(\d+)$/.exec(path);
    if (listMatch?.[1]) {
      const id = Number(listMatch[1]);
      if (!ownsList(db, user.id, id)) {
        send(res, 404, { error: "Lijst niet gevonden" });
        return;
      }
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
      const id = Number(listWatchAll[1]);
      if (!ownsList(db, user.id, id)) {
        send(res, 404, { error: "Lijst niet gevonden" });
        return;
      }
      const body = await readJson(req);
      setListWatched(db, user.id, id, body["watched"] !== false, Date.now());
      send(res, 200, { ok: true });
      return;
    }

    const listItemsMatch = /^\/api\/lists\/(\d+)\/items$/.exec(path);
    if (method === "POST" && listItemsMatch?.[1]) {
      const listId = Number(listItemsMatch[1]);
      if (!ownsList(db, user.id, listId)) {
        send(res, 404, { error: "Lijst niet gevonden" });
        return;
      }
      const body = await readJson(req);
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

    const itemMatch2 = /^\/api\/list-items\/(\d+)(?:\/(purchase|watch))?$/.exec(
      path,
    );
    if (itemMatch2?.[1]) {
      const id = Number(itemMatch2[1]);
      if (!ownsItem(db, user.id, id)) {
        send(res, 404, { error: "Item niet gevonden" });
        return;
      }
      const sub = itemMatch2[2];
      if (!sub && method === "PUT") {
        const body = await readJson(req);
        if (typeof body["quantity"] === "number") {
          setItemQuantity(db, id, body["quantity"]);
        }
        send(res, 200, { ok: true });
        return;
      }
      if (!sub && method === "DELETE") {
        removeListItem(db, id);
        send(res, 200, { ok: true });
        return;
      }
      if (sub === "purchase" && method === "POST") {
        const body = await readJson(req);
        const pieces = Array.isArray(body["pieces"]) ? body["pieces"] : [];
        const prices = pieces.map((p: unknown) =>
          typeof p === "number" ? p : undefined,
        );
        const count = recordPieces(
          db,
          id,
          prices,
          str(body["storeName"]) || undefined,
          Date.now(),
        );
        send(res, 200, { recorded: count });
        return;
      }
      if (sub === "watch" && method === "PUT") {
        const body = await readJson(req);
        setItemWatched(db, user.id, id, body["watched"] !== false, Date.now());
        send(res, 200, { ok: true });
        return;
      }
    }

    const purchaseMatch = /^\/api\/purchases\/(\d+)$/.exec(path);
    if (method === "DELETE" && purchaseMatch?.[1]) {
      const id = Number(purchaseMatch[1]);
      if (!ownsPurchase(db, user.id, id)) {
        send(res, 404, { error: "Aankoop niet gevonden" });
        return;
      }
      undoPurchase(db, id);
      send(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && path === "/api/list/parse") {
      const body = await readJson(req);
      const items = parseShoppingList(str(body["text"])).slice(0, 200);
      send(res, 200, { items });
      return;
    }

    // ------------------------------------------------------------ trips
    if (method === "GET" && path === "/api/trips") {
      send(res, 200, await computeTrips(db, user.id));
      return;
    }

    if (method === "POST" && path === "/api/trips/share") {
      // Sends a map link to the user's own active notification channels (their phone).
      const body = await readJson(req);
      const link = str(body["url"]);
      if (!link.startsWith("https://www.google.com/maps/dir/")) {
        send(res, 400, { error: "Ongeldige kaartlink" });
        return;
      }
      try {
        const title = str(body["title"]).slice(0, 120) || "Route";
        const summary = await deliver(db, user, {
          title: `Tweedekans: ${title}`,
          body: "Tik om de route op de kaart te openen.",
          links: { click: link, actions: [] },
        });
        if (summary === "geen kanaal actief") {
          send(res, 400, {
            error:
              "Geen meldingskanaal actief. Zet er een aan bij Instellingen → Meldingen.",
          });
          return;
        }
        if (!summary.includes(": ok")) {
          send(res, 400, { error: `Versturen mislukt (${summary})` });
          return;
        }
        send(res, 200, { ok: true, summary });
      } catch (error) {
        send(res, 400, {
          error: error instanceof Error ? error.message : "versturen mislukt",
        });
      }
      return;
    }

    // ------------------------------------------------------------ alerts + offers
    if (method === "GET" && path === "/api/alerts") {
      send(
        res,
        200,
        listAlerts(
          db,
          user.id,
          num(url.searchParams.get("limit")),
          num(url.searchParams.get("offset")),
        ),
      );
      return;
    }

    if (method === "POST" && path === "/api/alerts/seen") {
      markAlertsSeen(db, user.id);
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
        searchOffers(db, ctx, {
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
