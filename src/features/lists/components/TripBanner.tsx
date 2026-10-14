"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api-client.ts";
import { countryTag, duration, money } from "@/lib/format.ts";
import type { TripsResponse } from "@/server/trips.ts";

type BestRoute = Extract<TripsResponse, { configured: true }>["bestRoute"];

const routeText = (names: string[]): string => {
  const [first, second] = names;
  if (names.length === 1) return `naar ${first ?? ""}`;
  if (names.length === 2) return `naar ${first ?? ""} via ${second ?? ""}`;
  return `naar ${first ?? ""} via ${names.slice(1, -1).join(", ")} naar ${names[names.length - 1] ?? ""}`;
};

/** Green (or orange) banner when the best route is worth it; never blocks the page on errors. */
export function TripBanner({ refreshKey }: { refreshKey: number }) {
  const [route, setRoute] = useState<BestRoute>(undefined);

  useEffect(() => {
    let cancelled = false;
    void api<TripsResponse>("/api/trips")
      .then((data) => {
        if (!cancelled) setRoute(data.configured ? data.bestRoute : undefined);
      })
      .catch(() => {
        if (!cancelled) setRoute(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!route || route.status === "bad") return null;
  const names = route.stops.map((s) => s.storeName + countryTag(s.country));
  const units = route.stops.reduce(
    (n, s) => n + s.units.reduce((m, u) => m + u.count, 0),
    0,
  );
  const good = route.status === "good";
  return (
    <Link href="/trips" className={good ? "banner-good" : "banner-warn"}>
      <strong>
        {good
          ? `Een ritje ${routeText(names)} is rendabel: +${money(route.net)} netto`
          : `Een ritje ${routeText(names)} is rendabel in geld (+${money(route.moneyNet)}), maar niet in tijd`}
      </strong>
      <span>
        {` · ${String(route.totalKm)} km, ${duration(route.totalMinutes)} totaal, ${String(units)} stuks, besparing ${money(route.saving)} min ${money(route.tripCost)} brandstof${route.timeCost > 0 ? `, tijdkosten ${money(route.timeCost)}` : ""}`}
      </span>
    </Link>
  );
}
