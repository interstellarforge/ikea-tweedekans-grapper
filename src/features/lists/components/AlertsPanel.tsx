"use client";

import Link from "next/link";

import { notifyAlertsChanged } from "@/lib/alerts-events.ts";
import { send } from "@/lib/api-client.ts";
import { ago, countryTag, money } from "@/lib/format.ts";
import type { Alert } from "@/server/watchlist.ts";

/** Unseen alerts at the top of the lists page. */
export function AlertsPanel({
  alerts,
  onSeen,
}: {
  alerts: Alert[];
  onSeen: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <section className="panel">
      <div className="row">
        <h2 style={{ margin: 0 }}>Meldingen</h2>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void send("/api/alerts/seen", "POST").then(() => {
              notifyAlertsChanged();
              onSeen();
            });
          }}
        >
          Alles gezien
        </button>
        <Link href="/alerts" className="btn secondary">
          Alle meldingen
        </Link>
      </div>
      <div>
        {alerts.map((a) => (
          <div className="alert" key={`${a.storeId}-${a.offerNumber}`}>
            <strong>{`${a.title} ligt in ${a.storeName}${countryTag(a.country)} voor ${money(a.price)}!`}</strong>
            <span className="meta">{`${a.description} · ${ago(a.createdAt)}`}</span>
            <Link href={`/product/${a.articleNumber}`}>Bekijk product</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
