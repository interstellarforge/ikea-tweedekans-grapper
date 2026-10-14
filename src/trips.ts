import type { DatabaseSync } from "node:sqlite";

import { listStores } from "./db.ts";
import { getSettings } from "./settings.ts";
import { STORE_COORDS } from "./store-coords.ts";

const DETOUR_FACTOR = 1.3;
/** Estimated driving speed (km/h) used when no routed duration is available. */
const ESTIMATE_KMH = 60;
/** Up to this many stops every visiting order is tried; beyond it a fast heuristic is used. */
const EXACT_ORDER_MAX_STOPS = 4;
const POSTCODE_RE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;

export const normalizePostcode = (p: string): string | undefined =>
  POSTCODE_RE.test(p.trim()) ? p.replace(/\s+/g, "").toUpperCase() : undefined;

export type Leg = { km: number; minutes: number };

export type TripOffer = { price: number; originalPrice: number | undefined };

export type TripItemInput = {
  articleNumber: string;
  name: string;
  quantity: number;
  offers: TripOffer[];
};

export type TripItemResult = {
  articleNumber: string;
  name: string;
  wanted: number;
  found: number;
  /** Money spent on the units found. */
  spend: number;
  /** New price minus second-hand price over the units found (when the new price is known). */
  saving: number;
};

/** good: profitable after time cost; time: profitable in money only; bad: not profitable. */
export type TripStatus = "good" | "time" | "bad";

const tripStatus = (
  hasItems: boolean,
  moneyNet: number,
  net: number,
): TripStatus => {
  if (!hasItems) return "bad";
  if (net > 0) return "good";
  return moneyNet > 0 ? "time" : "bad";
};

export type TripResult = {
  items: TripItemResult[];
  /** Takes longer than the maximum trip time from the settings. */
  tooLong: boolean;
  roundTripKm: number;
  driveMinutes: number;
  /** Time spent inside the store (picking up). */
  stopMinutes: number;
  totalMinutes: number;
  tripCost: number;
  /** Value of the total time at the hourly rate. */
  timeCost: number;
  spend: number;
  saving: number;
  /** Saving minus fuel (before time cost). */
  moneyNet: number;
  /** Saving minus fuel minus time cost. */
  net: number;
  status: TripStatus;
  worthIt: boolean;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const unitSaving = (o: TripOffer): number =>
  o.originalPrice ? o.originalPrice - o.price : 0;

/** Best units first: biggest saving versus new price, then cheapest. */
const bySavingThenPrice = (a: TripOffer, b: TripOffer): number =>
  unitSaving(b) - unitSaving(a) || a.price - b.price;

const fuelCost = (
  km: number,
  fuelPrice: number,
  consumptionPer100km: number,
): number => round2(km * (consumptionPer100km / 100) * fuelPrice);

/**
 * Pure single-store evaluation: for every wanted product take the best offers up to the wanted
 * quantity; net = saving versus new price - fuel cost of the round trip.
 */
export function evaluateTrip(input: {
  distanceKm: number;
  oneWayMinutes: number;
  stopMinutes: number;
  hourlyRate: number;
  /** Longest accepted trip in minutes (0 = no limit). */
  maxMinutes?: number;
  fuelPrice: number;
  consumptionPer100km: number;
  items: TripItemInput[];
}): TripResult {
  const roundTripKm = round2(input.distanceKm * 2);
  const tripCost = fuelCost(
    roundTripKm,
    input.fuelPrice,
    input.consumptionPer100km,
  );
  const items = input.items.map((item): TripItemResult => {
    const picked = [...item.offers]
      .sort(bySavingThenPrice)
      .slice(0, item.quantity);
    return {
      articleNumber: item.articleNumber,
      name: item.name,
      wanted: item.quantity,
      found: picked.length,
      spend: round2(picked.reduce((s, o) => s + o.price, 0)),
      saving: round2(picked.reduce((s, o) => s + unitSaving(o), 0)),
    };
  });
  const saving = round2(items.reduce((s, i) => s + i.saving, 0));
  const driveMinutes = Math.round(input.oneWayMinutes * 2);
  const totalMinutes = driveMinutes + input.stopMinutes;
  const timeCost = round2((totalMinutes / 60) * input.hourlyRate);
  const moneyNet = round2(saving - tripCost);
  const net = round2(moneyNet - timeCost);
  const maxMinutes = input.maxMinutes ?? 0;
  const tooLong = maxMinutes > 0 && totalMinutes > maxMinutes;
  const status = tooLong
    ? "bad"
    : tripStatus(
        items.some((i) => i.found > 0),
        moneyNet,
        net,
      );
  return {
    items,
    tooLong,
    roundTripKm,
    driveMinutes,
    stopMinutes: input.stopMinutes,
    totalMinutes,
    tripCost,
    timeCost,
    spend: round2(items.reduce((s, i) => s + i.spend, 0)),
    saving,
    moneyNet,
    net,
    status,
    worthIt: status === "good",
  };
}

export type RouteOffer = TripOffer & {
  storeId: string;
  articleNumber: string;
};

export type RouteWant = {
  articleNumber: string;
  name: string;
  quantity: number;
};

export type RouteStop = {
  storeId: string;
  units: {
    articleNumber: string;
    name: string;
    count: number;
    spend: number;
    saving: number;
  }[];
};

export type RouteResult = {
  stops: RouteStop[];
  totalKm: number;
  driveMinutes: number;
  stopMinutes: number;
  totalMinutes: number;
  tripCost: number;
  timeCost: number;
  spend: number;
  saving: number;
  moneyNet: number;
  net: number;
  status: TripStatus;
  worthIt: boolean;
};

type OffersByArticle = Map<string, RouteOffer[]>;

const indexOffers = (offers: RouteOffer[]): OffersByArticle => {
  const map: OffersByArticle = new Map();
  for (const o of offers) {
    const list = map.get(o.articleNumber) ?? [];
    list.push(o);
    map.set(o.articleNumber, list);
  }
  for (const list of map.values()) list.sort(bySavingThenPrice);
  return map;
};

/**
 * Buys every wanted product (never more than its quantity) from the best units available among
 * the visited stores. Returns undefined when a visited store would not sell anything.
 */
function allocate(
  visited: string[],
  wants: RouteWant[],
  byArticle: OffersByArticle,
): Map<string, RouteStop["units"]> | undefined {
  const set = new Set(visited);
  const perStore = new Map<string, Map<string, RouteStop["units"][number]>>();
  for (const id of visited) perStore.set(id, new Map());
  for (const want of wants) {
    let left = want.quantity;
    for (const o of byArticle.get(want.articleNumber) ?? []) {
      if (left === 0) break;
      if (!set.has(o.storeId)) continue;
      left -= 1;
      const units = perStore.get(o.storeId);
      if (!units) continue;
      const unit = units.get(want.articleNumber) ?? {
        articleNumber: want.articleNumber,
        name: want.name,
        count: 0,
        spend: 0,
        saving: 0,
      };
      unit.count += 1;
      unit.spend = round2(unit.spend + o.price);
      unit.saving = round2(unit.saving + unitSaving(o));
      units.set(want.articleNumber, unit);
    }
  }
  const result = new Map<string, RouteStop["units"]>();
  for (const [id, units] of perStore) {
    if (units.size === 0) return undefined;
    result.set(id, [...units.values()]);
  }
  return result;
}

function* subsets<T>(items: T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i++) {
    const item = items[i] as T;
    for (const rest of subsets(items, size - 1, i + 1)) yield [item, ...rest];
  }
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i] as T, ...p];
  }
}

/** Nearest-neighbour start followed by 2-opt; good enough for long routes without brute force. */
function heuristicOrder(
  stores: string[],
  homeKm: (id: string) => number,
  betweenKm: (a: string, b: string) => number,
): string[] {
  const remaining = new Set(stores);
  let order: string[] = [];
  let current: string | undefined;
  while (remaining.size > 0) {
    let pick: string | undefined;
    let pickKm = Number.POSITIVE_INFINITY;
    for (const id of remaining) {
      const km = current ? betweenKm(current, id) : homeKm(id);
      if (km < pickKm) {
        pickKm = km;
        pick = id;
      }
    }
    const next = pick ?? [...remaining][0] ?? "";
    order.push(next);
    remaining.delete(next);
    current = next;
  }
  const total = (o: string[]): number =>
    homeKm(o[0] ?? "") +
    o.slice(1).reduce((n, id, i) => n + betweenKm(o[i] ?? "", id), 0) +
    homeKm(o[o.length - 1] ?? "");
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        if (total(candidate) < total(order)) {
          order = candidate;
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * Finds the route (subset of at most `maxStops` stores, visited in the best order) with the best
 * net. Up to 4 stops every order is tried; more stops use a fast heuristic for the order.
 */
export function findBestRoute(input: {
  storeIds: string[];
  maxStops: number;
  /** Minutes spent inside each visited store. */
  stopMinutes: number;
  /** Value of one hour of your time (EUR); 0 ignores time. */
  hourlyRate: number;
  /** Routes taking longer than this many minutes are skipped (0 = no limit). */
  maxMinutes?: number;
  homeLeg: (storeId: string) => Leg;
  betweenLeg: (from: string, to: string) => Leg;
  fuelPrice: number;
  consumptionPer100km: number;
  wants: RouteWant[];
  offers: RouteOffer[];
}): {
  best: RouteResult | undefined;
  bestSingle: RouteResult | undefined;
  /** Best route per store combination that is profitable, best first (max 6). */
  top: RouteResult[];
} {
  const byArticle = indexOffers(input.offers);
  const wanted = new Set(input.wants.map((w) => w.articleNumber));
  const useful = input.storeIds.filter((id) =>
    input.offers.some((o) => o.storeId === id && wanted.has(o.articleNumber)),
  );
  let best: RouteResult | undefined;
  let bestSingle: RouteResult | undefined;
  const candidates: RouteResult[] = [];
  const better = (a: RouteResult, b: RouteResult | undefined): boolean =>
    !b || a.net > b.net || (a.net === b.net && a.totalKm < b.totalKm);

  const homeKm = (id: string): number => input.homeLeg(id).km;
  const betweenKm = (a: string, b: string): number => input.betweenLeg(a, b).km;

  for (let size = 1; size <= Math.min(input.maxStops, useful.length); size++) {
    for (const subset of subsets(useful, size)) {
      const units = allocate(subset, input.wants, byArticle);
      if (!units) continue;
      const saving = round2(
        [...units.values()].flat().reduce((n, u) => n + u.saving, 0),
      );
      const spend = round2(
        [...units.values()].flat().reduce((n, u) => n + u.spend, 0),
      );
      const orders =
        size <= EXACT_ORDER_MAX_STOPS
          ? permutations(subset)
          : [heuristicOrder(subset, homeKm, betweenKm)];
      let bestOfSubset: RouteResult | undefined;
      for (const order of orders) {
        const first = order[0] ?? "";
        const last = order[order.length - 1] ?? "";
        let km = input.homeLeg(first).km + input.homeLeg(last).km;
        let minutes =
          input.homeLeg(first).minutes + input.homeLeg(last).minutes;
        for (let i = 1; i < order.length; i++) {
          const leg = input.betweenLeg(order[i - 1] ?? "", order[i] ?? "");
          km += leg.km;
          minutes += leg.minutes;
        }
        const tripCost = fuelCost(
          km,
          input.fuelPrice,
          input.consumptionPer100km,
        );
        const stopMinutes = order.length * input.stopMinutes;
        const totalMinutes = Math.round(minutes) + stopMinutes;
        if (input.maxMinutes && totalMinutes > input.maxMinutes) continue;
        const timeCost = round2((totalMinutes / 60) * input.hourlyRate);
        const moneyNet = round2(saving - tripCost);
        const net = round2(moneyNet - timeCost);
        const status = tripStatus(true, moneyNet, net);
        const result: RouteResult = {
          stops: order.map((storeId) => ({
            storeId,
            units: units.get(storeId) ?? [],
          })),
          totalKm: round2(km),
          driveMinutes: Math.round(minutes),
          stopMinutes,
          totalMinutes,
          tripCost,
          timeCost,
          spend,
          saving,
          moneyNet,
          net,
          status,
          worthIt: status === "good",
        };
        if (better(result, best)) best = result;
        if (size === 1 && better(result, bestSingle)) bestSingle = result;
        if (better(result, bestOfSubset)) bestOfSubset = result;
      }
      if (bestOfSubset && bestOfSubset.status !== "bad") {
        candidates.push(bestOfSubset);
      }
    }
  }
  const top = candidates
    .sort((a, b) => b.net - a.net || a.totalKm - b.totalKm)
    .slice(0, 6);
  return { best, bestSingle, top };
}

const toRad = (d: number): number => (d * Math.PI) / 180;

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const estimateLeg = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): Leg => {
  const km = Math.round(haversineKm(a, b) * DETOUR_FACTOR * 10) / 10;
  return { km, minutes: Math.round((km / ESTIMATE_KMH) * 60) };
};

async function geocodePostcode(
  db: DatabaseSync,
  postcode: string,
): Promise<{ lat: number; lon: number }> {
  const cached = db
    .prepare("SELECT lat, lon FROM home_geo WHERE postcode = ?")
    .get(postcode) as { lat: number; lon: number } | undefined;
  if (cached) return cached;
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(`postcode:${postcode}`)}&rows=1&fl=centroide_ll`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`PDOK ${String(res.status)}`);
  const data = (await res.json()) as {
    response: { docs: { centroide_ll: string }[] };
  };
  const match = /POINT\(([\d.-]+) ([\d.-]+)\)/.exec(
    data.response.docs[0]?.centroide_ll ?? "",
  );
  if (!match?.[1] || !match[2]) throw new Error("Postcode niet gevonden");
  const geo = { lat: Number(match[2]), lon: Number(match[1]) };
  db.prepare(
    "INSERT OR REPLACE INTO home_geo (postcode, lat, lon) VALUES (?, ?, ?)",
  ).run(postcode, geo.lat, geo.lon);
  return geo;
}

type Source = "route" | "estimate";

/** One-way driving leg home -> store via OSRM; falls back to an estimate. Cached per postcode+store. */
async function homeLeg(
  db: DatabaseSync,
  postcode: string,
  home: { lat: number; lon: number },
  storeId: string,
): Promise<(Leg & { source: Source }) | undefined> {
  const dest = STORE_COORDS[storeId];
  if (!dest) return undefined;
  const cached = db
    .prepare(
      "SELECT km, minutes, source FROM trip_cache WHERE postcode = ? AND store_id = ?",
    )
    .get(postcode, storeId) as
    { km: number; minutes: number | null; source: Source } | undefined;
  if (cached?.source === "route" && cached.minutes !== null) {
    return { km: cached.km, minutes: cached.minutes, source: "route" };
  }

  let result: Leg & { source: Source };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${String(home.lon)},${String(home.lat)};${String(dest.lon)},${String(dest.lat)}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number }[];
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error("no route");
    result = {
      km: Math.round(route.distance / 100) / 10,
      minutes: Math.round(route.duration / 60),
      source: "route",
    };
  } catch {
    result = { ...estimateLeg(home, dest), source: "estimate" };
  }
  db.prepare(
    "INSERT OR REPLACE INTO trip_cache (postcode, store_id, km, minutes, source) VALUES (?, ?, ?, ?, ?)",
  ).run(postcode, storeId, result.km, result.minutes, result.source);
  return result;
}

export type StoreTrip = TripResult & {
  storeId: string;
  storeName: string;
  country: string;
  followed: boolean;
  oneWayKm: number;
  distanceSource: Source;
};

export type RouteStopView = {
  storeId: string;
  storeName: string;
  country: string;
  followed: boolean;
  /** Leg that ends at this stop. */
  legKm: number;
  legMinutes: number;
  units: RouteStop["units"];
};

export type BestRoute = Omit<RouteResult, "stops"> & {
  stops: RouteStopView[];
  /** Net advantage over the best single store (0 when the best route is a single store). */
  gainOverSingle: number;
  bestSingleName: string | undefined;
  bestSingleNet: number | undefined;
  /** True when more than 4 stops: the visiting order is approximated. */
  approximateOrder: boolean;
};

export type TripsResponse =
  | { configured: false; reason: string }
  | {
      configured: true;
      postcode: string;
      fuelPrice: number;
      consumptionPer100km: number;
      maxStops: number;
      stopMinutes: number;
      hourlyRate: number;
      maxTripMinutes: number;
      routeAllStores: boolean;
      wantedUnits: number;
      stores: StoreTrip[];
      bestRoute: BestRoute | undefined;
      /** Other profitable store combinations (best first). */
      alternatives: BestRoute[];
    };

/** Driving legs between stores (directed), via one OSRM table request; cached. */
async function ensureStoreDistances(
  db: DatabaseSync,
  storeIds: string[],
): Promise<void> {
  const known = new Set(
    (
      db
        .prepare(
          "SELECT from_store, to_store FROM store_dist WHERE minutes IS NOT NULL",
        )
        .all() as { from_store: string; to_store: string }[]
    ).map((r) => `${r.from_store}>${r.to_store}`),
  );
  const ids = storeIds.filter((id) => STORE_COORDS[id]);
  const missing = ids.some((a) =>
    ids.some((b) => a !== b && !known.has(`${a}>${b}`)),
  );
  if (!missing) return;

  let km: (number | null)[][] | undefined;
  let secs: (number | null)[][] | undefined;
  try {
    const coords = ids
      .map(
        (id) =>
          `${String(STORE_COORDS[id]?.lon)},${String(STORE_COORDS[id]?.lat)}`,
      )
      .join(";");
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance,duration`,
      { signal: AbortSignal.timeout(20_000) },
    );
    const data = (await res.json()) as {
      code: string;
      distances?: (number | null)[][];
      durations?: (number | null)[][];
    };
    if (data.code === "Ok") {
      km = data.distances;
      secs = data.durations;
    }
  } catch {
    km = undefined;
  }
  const put = db.prepare(
    "INSERT OR REPLACE INTO store_dist (from_store, to_store, km, minutes, source) VALUES (?, ?, ?, ?, ?)",
  );
  ids.forEach((a, i) => {
    ids.forEach((b, j) => {
      if (a === b) return;
      const from = STORE_COORDS[a];
      const to = STORE_COORDS[b];
      if (!from || !to) return;
      const meters = km?.[i]?.[j];
      const seconds = secs?.[i]?.[j];
      if (typeof meters === "number" && typeof seconds === "number") {
        put.run(
          a,
          b,
          Math.round(meters / 100) / 10,
          Math.round(seconds / 60),
          "route",
        );
      } else {
        const leg = estimateLeg(from, to);
        put.run(a, b, leg.km, leg.minutes, "estimate");
      }
    });
  });
}

function storeLeg(db: DatabaseSync, from: string, to: string): Leg {
  if (from === to) return { km: 0, minutes: 0 };
  const row = db
    .prepare(
      "SELECT km, minutes FROM store_dist WHERE from_store = ? AND to_store = ?",
    )
    .get(from, to) as { km: number; minutes: number | null } | undefined;
  return row
    ? { km: row.km, minutes: row.minutes ?? row.km }
    : { km: Number.POSITIVE_INFINITY, minutes: Number.POSITIVE_INFINITY };
}

export async function computeTrips(db: DatabaseSync): Promise<TripsResponse> {
  const settings = getSettings(db);
  const postcode = normalizePostcode(settings.homePostcode);
  if (!postcode) {
    return { configured: false, reason: "Vul je postcode in bij Instellingen" };
  }
  const watch = db
    .prepare(
      `SELECT w.article_number, w.name, w.type_name, n.needed AS quantity
       FROM watch_items w JOIN watch_need n ON n.article_number = w.article_number
       WHERE n.needed > 0`,
    )
    .all() as {
    article_number: string;
    name: string;
    type_name: string;
    quantity: number;
  }[];
  if (watch.length === 0) {
    const total = (
      db.prepare("SELECT COUNT(*) AS n FROM watch_items").get() as {
        n: number;
      }
    ).n;
    return {
      configured: false,
      reason:
        total === 0
          ? "Je watchlist is leeg"
          : "Alles op je boodschappenlijst is al gehaald",
    };
  }
  const home = await geocodePostcode(db, postcode);
  const offersStmt = db.prepare(
    `SELECT price, original_price FROM offers
     WHERE store_id = ? AND article_number = ? AND active = 1`,
  );
  const storeList = listStores(db);
  // Driving legs home -> store, a few requests at a time (many stores when BE/DE are enabled).
  const legs = new Map<string, Awaited<ReturnType<typeof homeLeg>>>();
  const candidates = storeList.filter((s) => !s.tripExcluded);
  for (let i = 0; i < candidates.length; i += 6) {
    await Promise.all(
      candidates.slice(i, i + 6).map(async (s) => {
        legs.set(s.storeId, await homeLeg(db, postcode, home, s.storeId));
      }),
    );
  }
  const stores: StoreTrip[] = [];
  const homeLegs = new Map<string, Leg>();
  const routeOffers: RouteOffer[] = [];
  for (const store of storeList) {
    if (store.tripExcluded) continue;
    const leg = legs.get(store.storeId);
    if (!leg) continue;
    homeLegs.set(store.storeId, leg);
    const items = watch.map((w): TripItemInput => {
      const offers = (
        offersStmt.all(store.storeId, w.article_number) as {
          price: number;
          original_price: number | null;
        }[]
      ).map((o) => ({
        price: o.price,
        originalPrice: o.original_price ?? undefined,
      }));
      return {
        articleNumber: w.article_number,
        name: `${w.name} ${w.type_name}`.trim(),
        quantity: w.quantity,
        offers,
      };
    });
    stores.push({
      ...evaluateTrip({
        distanceKm: leg.km,
        oneWayMinutes: leg.minutes,
        stopMinutes: settings.stopMinutes,
        hourlyRate: settings.hourlyRate,
        maxMinutes: settings.maxTripMinutes,
        fuelPrice: settings.fuelPrice,
        consumptionPer100km: settings.consumptionPer100km,
        items,
      }),
      storeId: store.storeId,
      storeName: store.name,
      country: store.country,
      followed: store.followed,
      oneWayKm: leg.km,
      distanceSource: leg.source,
    });
    // Routes may use all non-excluded stores, or only followed ones.
    if (settings.routeAllStores || store.followed) {
      for (const item of items) {
        for (const o of item.offers) {
          routeOffers.push({
            ...o,
            storeId: store.storeId,
            articleNumber: item.articleNumber,
          });
        }
      }
    }
  }
  stores.sort((a, b) => b.net - a.net);

  const storeIds = [...new Set(routeOffers.map((o) => o.storeId))].filter(
    (id) => homeLegs.has(id),
  );
  await ensureStoreDistances(db, storeIds);
  const wants = watch.map((w) => ({
    articleNumber: w.article_number,
    name: `${w.name} ${w.type_name}`.trim(),
    quantity: w.quantity,
  }));
  const unreachable: Leg = {
    km: Number.POSITIVE_INFINITY,
    minutes: Number.POSITIVE_INFINITY,
  };
  const { best, bestSingle, top } = findBestRoute({
    storeIds,
    maxStops: settings.maxStops,
    stopMinutes: settings.stopMinutes,
    hourlyRate: settings.hourlyRate,
    maxMinutes: settings.maxTripMinutes,
    homeLeg: (id) => homeLegs.get(id) ?? unreachable,
    betweenLeg: (a, b) => storeLeg(db, a, b),
    fuelPrice: settings.fuelPrice,
    consumptionPer100km: settings.consumptionPer100km,
    wants,
    offers: routeOffers,
  });

  const storeOf = (id: string) => storeList.find((s) => s.storeId === id);
  const toView = (route: RouteResult): BestRoute => {
    let prev: string | undefined;
    const stops = route.stops.map((stop): RouteStopView => {
      const leg = prev
        ? storeLeg(db, prev, stop.storeId)
        : (homeLegs.get(stop.storeId) ?? { km: 0, minutes: 0 });
      prev = stop.storeId;
      return {
        storeId: stop.storeId,
        storeName: storeOf(stop.storeId)?.name ?? stop.storeId,
        country: storeOf(stop.storeId)?.country ?? "nl",
        followed: storeOf(stop.storeId)?.followed ?? false,
        legKm: leg.km,
        legMinutes: leg.minutes,
        units: stop.units,
      };
    });
    const singleStore = bestSingle?.stops[0]?.storeId;
    return {
      ...route,
      stops,
      gainOverSingle: bestSingle ? round2(route.net - bestSingle.net) : 0,
      bestSingleName: singleStore ? storeOf(singleStore)?.name : undefined,
      bestSingleNet: bestSingle?.net,
      approximateOrder: stops.length > EXACT_ORDER_MAX_STOPS,
    };
  };
  const bestRoute = best ? toView(best) : undefined;
  // Profitable alternatives: other store combinations, best first (the best route excluded).
  const keyOf = (r: BestRoute): string =>
    r.stops
      .map((st) => st.storeId)
      .sort()
      .join();
  const bestKey = bestRoute ? keyOf(bestRoute) : undefined;
  const alternatives = top
    .map(toView)
    .filter((r) => keyOf(r) !== bestKey)
    .slice(0, 5);

  return {
    configured: true,
    postcode,
    fuelPrice: settings.fuelPrice,
    consumptionPer100km: settings.consumptionPer100km,
    maxStops: settings.maxStops,
    stopMinutes: settings.stopMinutes,
    hourlyRate: settings.hourlyRate,
    maxTripMinutes: settings.maxTripMinutes,
    routeAllStores: settings.routeAllStores,
    wantedUnits: watch.reduce((s, w) => s + w.quantity, 0),
    stores,
    bestRoute,
    alternatives,
  };
}
