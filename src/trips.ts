import type { DatabaseSync } from "node:sqlite";

import { listStores } from "./db.ts";
import { getSettings } from "./settings.ts";

/** Approximate store locations (OpenStreetMap), keyed by IKEA store id. Netherlands only. */
export const STORE_COORDS: Record<string, { lat: number; lon: number }> = {
  "415": { lat: 52.1853, lon: 5.4174 }, // Amersfoort
  "088": { lat: 52.3021, lon: 4.9497 }, // Amsterdam
  "274": { lat: 51.8494, lon: 4.5125 }, // Barendrecht
  "403": { lat: 51.5803, lon: 4.7291 }, // Breda
  "151": { lat: 52.0129, lon: 4.3797 }, // Delft
  "272": { lat: 51.9662, lon: 5.9968 }, // Duiven
  "087": { lat: 51.4993, lon: 5.4726 }, // Eindhoven
  "404": { lat: 53.2175, lon: 6.5873 }, // Groningen
  "378": { lat: 52.3848, lon: 4.6717 }, // Haarlem
  "089": { lat: 50.8993, lon: 5.9451 }, // Heerlen
  "312": { lat: 52.2887, lon: 6.7678 }, // Hengelo
  "270": { lat: 52.0623, lon: 5.0992 }, // Utrecht
  "391": { lat: 52.5322, lon: 6.1626 }, // Zwolle
};

const DETOUR_FACTOR = 1.3;
const POSTCODE_RE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;

export const normalizePostcode = (p: string): string | undefined =>
  POSTCODE_RE.test(p.trim()) ? p.replace(/\s+/g, "").toUpperCase() : undefined;

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

export type TripResult = {
  items: TripItemResult[];
  roundTripKm: number;
  tripCost: number;
  spend: number;
  saving: number;
  net: number;
  worthIt: boolean;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const unitSaving = (o: TripOffer): number =>
  o.originalPrice ? o.originalPrice - o.price : 0;

/** Best units first: biggest saving versus new price, then cheapest. */
const bySavingThenPrice = (a: TripOffer, b: TripOffer): number =>
  unitSaving(b) - unitSaving(a) || a.price - b.price;

/**
 * Pure trip evaluation: for every wanted product take the cheapest offers up to the
 * wanted quantity; net = saving versus new price - fuel cost of the round trip.
 */
export function evaluateTrip(input: {
  distanceKm: number;
  fuelPrice: number;
  consumptionPer100km: number;
  items: TripItemInput[];
}): TripResult {
  const roundTripKm = round2(input.distanceKm * 2);
  const tripCost = round2(
    roundTripKm * (input.consumptionPer100km / 100) * input.fuelPrice,
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
      saving: round2(
        picked.reduce(
          (s, o) => s + (o.originalPrice ? o.originalPrice - o.price : 0),
          0,
        ),
      ),
    };
  });
  const saving = round2(items.reduce((s, i) => s + i.saving, 0));
  const net = round2(saving - tripCost);
  return {
    items,
    roundTripKm,
    tripCost,
    spend: round2(items.reduce((s, i) => s + i.spend, 0)),
    saving,
    net,
    worthIt: items.some((i) => i.found > 0) && net > 0,
  };
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

/** One-way driving distance via OSRM; falls back to straight line x1.3. Cached per postcode+store. */
async function drivingKm(
  db: DatabaseSync,
  postcode: string,
  home: { lat: number; lon: number },
  storeId: string,
): Promise<{ km: number; source: "route" | "estimate" } | undefined> {
  const dest = STORE_COORDS[storeId];
  if (!dest) return undefined;
  const cached = db
    .prepare(
      "SELECT km, source FROM trip_cache WHERE postcode = ? AND store_id = ?",
    )
    .get(postcode, storeId) as
    { km: number; source: "route" | "estimate" } | undefined;
  if (cached?.source === "route") return cached;

  let result: { km: number; source: "route" | "estimate" };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${String(home.lon)},${String(home.lat)};${String(dest.lon)},${String(dest.lat)}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as {
      code: string;
      routes?: { distance: number }[];
    };
    const meters = data.routes?.[0]?.distance;
    if (data.code !== "Ok" || meters === undefined) throw new Error("no route");
    result = { km: Math.round(meters / 100) / 10, source: "route" };
  } catch {
    result = {
      km: Math.round(haversineKm(home, dest) * DETOUR_FACTOR * 10) / 10,
      source: "estimate",
    };
  }
  db.prepare(
    "INSERT OR REPLACE INTO trip_cache (postcode, store_id, km, source) VALUES (?, ?, ?, ?)",
  ).run(postcode, storeId, result.km, result.source);
  return result;
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
  tripCost: number;
  spend: number;
  saving: number;
  net: number;
  worthIt: boolean;
};

/**
 * Evaluates visiting `order` (store ids) in sequence. Each wanted product is bought only up to
 * its quantity, from the best units available among the visited stores. Returns undefined when a
 * stop would not buy anything (a shorter route would be better then).
 */
export function evaluateRoute(input: {
  order: string[];
  totalKm: number;
  fuelPrice: number;
  consumptionPer100km: number;
  wants: RouteWant[];
  offers: RouteOffer[];
}): RouteResult | undefined {
  const visited = new Set(input.order);
  const bought = new Map<string, RouteStop["units"][number]>();
  for (const want of input.wants) {
    const picked = input.offers
      .filter(
        (o) => o.articleNumber === want.articleNumber && visited.has(o.storeId),
      )
      .sort(bySavingThenPrice)
      .slice(0, want.quantity);
    for (const o of picked) {
      const key = `${o.storeId}|${want.articleNumber}`;
      const unit = bought.get(key) ?? {
        articleNumber: want.articleNumber,
        name: want.name,
        count: 0,
        spend: 0,
        saving: 0,
      };
      unit.count += 1;
      unit.spend = round2(unit.spend + o.price);
      unit.saving = round2(unit.saving + unitSaving(o));
      bought.set(key, unit);
    }
  }
  const stops: RouteStop[] = input.order.map((storeId) => ({
    storeId,
    units: [...bought.entries()]
      .filter(([key]) => key.startsWith(`${storeId}|`))
      .map(([, unit]) => unit),
  }));
  if (stops.some((s) => s.units.length === 0)) return undefined;
  const all = stops.flatMap((s) => s.units);
  const saving = round2(all.reduce((n, u) => n + u.saving, 0));
  const tripCost = round2(
    input.totalKm * (input.consumptionPer100km / 100) * input.fuelPrice,
  );
  const net = round2(saving - tripCost);
  return {
    stops,
    totalKm: round2(input.totalKm),
    tripCost,
    spend: round2(all.reduce((n, u) => n + u.spend, 0)),
    saving,
    net,
    worthIt: net > 0,
  };
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

/** Brute-forces every subset (<= maxStops) and visiting order; returns the route with the best net. */
export function findBestRoute(input: {
  storeIds: string[];
  maxStops: number;
  homeKm: (storeId: string) => number;
  betweenKm: (from: string, to: string) => number;
  fuelPrice: number;
  consumptionPer100km: number;
  wants: RouteWant[];
  offers: RouteOffer[];
}): { best: RouteResult | undefined; bestSingle: RouteResult | undefined } {
  const wanted = new Set(input.wants.map((w) => w.articleNumber));
  const useful = input.storeIds.filter((id) =>
    input.offers.some((o) => o.storeId === id && wanted.has(o.articleNumber)),
  );
  let best: RouteResult | undefined;
  let bestSingle: RouteResult | undefined;
  const better = (a: RouteResult, b: RouteResult | undefined): boolean =>
    !b || a.net > b.net || (a.net === b.net && a.totalKm < b.totalKm);

  for (let size = 1; size <= Math.min(input.maxStops, useful.length); size++) {
    for (const subset of subsets(useful, size)) {
      for (const order of permutations(subset)) {
        const first = order[0] ?? "";
        const last = order[order.length - 1] ?? "";
        let km = input.homeKm(first);
        for (let i = 1; i < order.length; i++) {
          km += input.betweenKm(order[i - 1] ?? "", order[i] ?? "");
        }
        km += input.homeKm(last);
        const result = evaluateRoute({
          order,
          totalKm: km,
          fuelPrice: input.fuelPrice,
          consumptionPer100km: input.consumptionPer100km,
          wants: input.wants,
          offers: input.offers,
        });
        if (!result) continue;
        if (better(result, best)) best = result;
        if (size === 1 && better(result, bestSingle)) bestSingle = result;
      }
    }
  }
  return { best, bestSingle };
}

export type StoreTrip = TripResult & {
  storeId: string;
  storeName: string;
  followed: boolean;
  oneWayKm: number;
  distanceSource: "route" | "estimate";
};

export type RouteStopView = {
  storeId: string;
  storeName: string;
  followed: boolean;
  /** Distance of the leg that ends at this stop (km). */
  legKm: number;
  units: RouteStop["units"];
};

export type BestRoute = Omit<RouteResult, "stops"> & {
  stops: RouteStopView[];
  /** Net advantage over the best single store (0 when the best route is a single store). */
  gainOverSingle: number;
  bestSingleName: string | undefined;
  bestSingleNet: number | undefined;
};

export type TripsResponse =
  | { configured: false; reason: string }
  | {
      configured: true;
      postcode: string;
      fuelPrice: number;
      consumptionPer100km: number;
      maxStops: number;
      wantedUnits: number;
      stores: StoreTrip[];
      bestRoute: BestRoute | undefined;
    };

/** Driving km between two stores (directed), via one OSRM table request; cached forever. */
async function ensureStoreDistances(
  db: DatabaseSync,
  storeIds: string[],
): Promise<void> {
  const known = new Set(
    (
      db.prepare("SELECT from_store, to_store FROM store_dist").all() as {
        from_store: string;
        to_store: string;
      }[]
    ).map((r) => `${r.from_store}>${r.to_store}`),
  );
  const ids = storeIds.filter((id) => STORE_COORDS[id]);
  const missing = ids.some((a) =>
    ids.some((b) => a !== b && !known.has(`${a}>${b}`)),
  );
  if (!missing) return;

  let matrix: (number | null)[][] | undefined;
  try {
    const coords = ids
      .map(
        (id) =>
          `${String(STORE_COORDS[id]?.lon)},${String(STORE_COORDS[id]?.lat)}`,
      )
      .join(";");
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`,
      { signal: AbortSignal.timeout(20_000) },
    );
    const data = (await res.json()) as {
      code: string;
      distances?: (number | null)[][];
    };
    if (data.code === "Ok") matrix = data.distances;
  } catch {
    matrix = undefined;
  }
  const put = db.prepare(
    "INSERT OR REPLACE INTO store_dist (from_store, to_store, km, source) VALUES (?, ?, ?, ?)",
  );
  ids.forEach((a, i) => {
    ids.forEach((b, j) => {
      if (a === b) return;
      const meters = matrix?.[i]?.[j];
      const from = STORE_COORDS[a];
      const to = STORE_COORDS[b];
      if (!from || !to) return;
      if (typeof meters === "number") {
        put.run(a, b, Math.round(meters / 100) / 10, "route");
      } else {
        put.run(
          a,
          b,
          Math.round(haversineKm(from, to) * DETOUR_FACTOR * 10) / 10,
          "estimate",
        );
      }
    });
  });
}

function storeKm(db: DatabaseSync, from: string, to: string): number {
  if (from === to) return 0;
  const row = db
    .prepare("SELECT km FROM store_dist WHERE from_store = ? AND to_store = ?")
    .get(from, to) as { km: number } | undefined;
  return row?.km ?? Number.POSITIVE_INFINITY;
}

export async function computeTrips(db: DatabaseSync): Promise<TripsResponse> {
  const settings = getSettings(db);
  const postcode = normalizePostcode(settings.homePostcode);
  if (!postcode) {
    return { configured: false, reason: "Vul je postcode in bij Instellingen" };
  }
  const watch = db
    .prepare(
      "SELECT article_number, name, type_name, quantity FROM watch_items",
    )
    .all() as {
    article_number: string;
    name: string;
    type_name: string;
    quantity: number;
  }[];
  if (watch.length === 0) {
    return { configured: false, reason: "Je watchlist is leeg" };
  }
  const home = await geocodePostcode(db, postcode);
  const offersStmt = db.prepare(
    `SELECT price, original_price FROM offers
     WHERE store_id = ? AND article_number = ? AND active = 1`,
  );
  const storeList = listStores(db);
  const stores: StoreTrip[] = [];
  const homeKm = new Map<string, number>();
  const routeOffers: RouteOffer[] = [];
  for (const store of storeList) {
    if (store.tripExcluded) continue;
    const dist = await drivingKm(db, postcode, home, store.storeId);
    if (!dist) continue;
    homeKm.set(store.storeId, dist.km);
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
      for (const o of offers) {
        routeOffers.push({
          ...o,
          storeId: store.storeId,
          articleNumber: w.article_number,
        });
      }
      return {
        articleNumber: w.article_number,
        name: `${w.name} ${w.type_name}`.trim(),
        quantity: w.quantity,
        offers,
      };
    });
    stores.push({
      ...evaluateTrip({
        distanceKm: dist.km,
        fuelPrice: settings.fuelPrice,
        consumptionPer100km: settings.consumptionPer100km,
        items,
      }),
      storeId: store.storeId,
      storeName: store.name,
      followed: store.followed,
      oneWayKm: dist.km,
      distanceSource: dist.source,
    });
  }
  stores.sort((a, b) => b.net - a.net);

  const storeIds = [...homeKm.keys()];
  await ensureStoreDistances(db, storeIds);
  const wants = watch.map((w) => ({
    articleNumber: w.article_number,
    name: `${w.name} ${w.type_name}`.trim(),
    quantity: w.quantity,
  }));
  const { best, bestSingle } = findBestRoute({
    storeIds,
    maxStops: settings.maxStops,
    homeKm: (id) => homeKm.get(id) ?? Number.POSITIVE_INFINITY,
    betweenKm: (a, b) => storeKm(db, a, b),
    fuelPrice: settings.fuelPrice,
    consumptionPer100km: settings.consumptionPer100km,
    wants,
    offers: routeOffers,
  });

  const nameOf = (id: string) => storeList.find((s) => s.storeId === id);
  let bestRoute: BestRoute | undefined;
  if (best) {
    let prev: string | undefined;
    const stops = best.stops.map((stop): RouteStopView => {
      const legKm = prev
        ? storeKm(db, prev, stop.storeId)
        : (homeKm.get(stop.storeId) ?? 0);
      prev = stop.storeId;
      return {
        storeId: stop.storeId,
        storeName: nameOf(stop.storeId)?.name ?? stop.storeId,
        followed: nameOf(stop.storeId)?.followed ?? false,
        legKm,
        units: stop.units,
      };
    });
    const singleStore = bestSingle?.stops[0]?.storeId;
    bestRoute = {
      ...best,
      stops,
      gainOverSingle: bestSingle ? round2(best.net - bestSingle.net) : 0,
      bestSingleName: singleStore ? nameOf(singleStore)?.name : undefined,
      bestSingleNet: bestSingle?.net,
    };
  }

  return {
    configured: true,
    postcode,
    fuelPrice: settings.fuelPrice,
    consumptionPer100km: settings.consumptionPer100km,
    maxStops: settings.maxStops,
    wantedUnits: watch.reduce((s, w) => s + w.quantity, 0),
    stores,
    bestRoute,
  };
}
