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
      .sort((a, b) => a.price - b.price)
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

export type StoreTrip = TripResult & {
  storeId: string;
  storeName: string;
  followed: boolean;
  oneWayKm: number;
  distanceSource: "route" | "estimate";
};

export type TripsResponse =
  | { configured: false; reason: string }
  | {
      configured: true;
      postcode: string;
      fuelPrice: number;
      consumptionPer100km: number;
      wantedUnits: number;
      stores: StoreTrip[];
    };

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
  const stores: StoreTrip[] = [];
  for (const store of listStores(db)) {
    const dist = await drivingKm(db, postcode, home, store.storeId);
    if (!dist) continue;
    const items = watch.map((w): TripItemInput => ({
      articleNumber: w.article_number,
      name: `${w.name} ${w.type_name}`.trim(),
      quantity: w.quantity,
      offers: (
        offersStmt.all(store.storeId, w.article_number) as {
          price: number;
          original_price: number | null;
        }[]
      ).map((o) => ({
        price: o.price,
        originalPrice: o.original_price ?? undefined,
      })),
    }));
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
  return {
    configured: true,
    postcode,
    fuelPrice: settings.fuelPrice,
    consumptionPer100km: settings.consumptionPer100km,
    wantedUnits: watch.reduce((s, w) => s + w.quantity, 0),
    stores,
  };
}
