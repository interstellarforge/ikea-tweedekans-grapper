"use client";

import "../lists.css";

import { useCallback, useEffect, useState } from "react";

import { useApiData } from "@/hooks/useApiData.ts";
import { useHashTab } from "@/hooks/useHashTab.ts";
import type { ListItemView, ListView } from "@/server/lists.ts";
import type { AlertPage } from "@/server/watchlist.ts";

import { AlertsPanel } from "./AlertsPanel.tsx";
import { BuyDialog, type BuyTarget } from "./BuyDialog.tsx";
import { ShoppingLists } from "./ShoppingLists.tsx";
import { TripBanner } from "./TripBanner.tsx";
import { WatchGrid, type WatchView } from "./WatchGrid.tsx";

const TABS = ["watchlist", "boodschappen"] as const;

const REFRESH_MS = 60_000;
const ALERT_LIMIT = 200;

export function ListsPage() {
  const watch = useApiData<WatchView[]>("/api/watchlist");
  const lists = useApiData<ListView[]>("/api/lists");
  const alerts = useApiData<AlertPage>(
    `/api/alerts?limit=${String(ALERT_LIMIT)}`,
  );
  const tab = useHashTab(TABS, "watchlist");
  const [buy, setBuy] = useState<BuyTarget | undefined>(undefined);
  const [tripKey, setTripKey] = useState(0);

  const { reload: reloadWatch } = watch;
  const { reload: reloadLists } = lists;
  const { reload: reloadAlerts } = alerts;

  const reloadAll = useCallback(() => {
    void reloadWatch();
    void reloadLists();
    void reloadAlerts();
    setTripKey((k) => k + 1);
  }, [reloadWatch, reloadLists, reloadAlerts]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (buy) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      reloadAll();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [buy, reloadAll]);

  const buyListItem = (item: ListItemView) => {
    setBuy({
      listItemId: item.id,
      articleNumber: item.articleNumber,
      name: `${item.name} ${item.typeName}`.trim(),
      image: item.image,
      remaining: item.remaining,
      estimate: item.estimateUnit,
      bestStore: item.bestOffer?.storeName,
      hasOffer: item.bestOffer !== undefined,
    });
  };

  const buyWatchItem = (item: WatchView) => {
    // From the watchlist: use the first shopping-list line that still needs pieces.
    const line = lists.data
      ?.flatMap((l) => l.items)
      .find((x) => x.articleNumber === item.articleNumber && x.remaining > 0);
    if (line) {
      buyListItem(line);
      return;
    }
    const best = item.insight?.offers[0];
    setBuy({
      listItemId: undefined,
      articleNumber: item.articleNumber,
      name: `${item.name} ${item.typeName}`.trim(),
      image: item.image,
      remaining: item.needed,
      estimate: best?.price,
      bestStore: best?.storeName,
      hasOffer: best !== undefined,
    });
  };

  const unseen = (alerts.data?.items ?? []).filter((a) => !a.seen);

  return (
    <main className="lists-page">
      <h1>Lijsten</h1>
      <TripBanner refreshKey={tripKey} />
      <AlertsPanel alerts={unseen} onSeen={reloadAll} />

      <nav className="tabs">
        <a href="#watchlist" className={tab === "watchlist" ? "active" : ""}>
          Watchlist
        </a>
        <a
          href="#boodschappen"
          className={tab === "boodschappen" ? "active" : ""}
        >
          Boodschappenlijsten
        </a>
      </nav>

      {tab === "watchlist" ? (
        <div>
          <p className="lead">
            Producten die je in de gaten houdt. Je krijgt een melding zodra ze
            in de tweedekanshoek van een gevolgd filiaal verschijnen. Hoeveel je
            er nog nodig hebt komt uit je boodschappenlijsten.
          </p>
          <WatchGrid
            items={watch.data ?? []}
            onChanged={reloadAll}
            onBuy={buyWatchItem}
          />
        </div>
      ) : (
        <ShoppingLists
          lists={lists.data ?? []}
          onChanged={reloadAll}
          onBuy={buyListItem}
        />
      )}

      {buy ? (
        <BuyDialog
          target={buy}
          onClose={() => {
            setBuy(undefined);
          }}
          onDone={reloadAll}
        />
      ) : null}
    </main>
  );
}
