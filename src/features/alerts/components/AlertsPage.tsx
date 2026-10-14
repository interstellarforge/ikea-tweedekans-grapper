"use client";

import "../alerts.css";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Empty } from "@/components/ui/Empty.tsx";
import { IconLabel } from "@/components/ui/Icon.tsx";
import { notifyAlertsChanged } from "@/lib/alerts-events.ts";
import { api, send } from "@/lib/api-client.ts";
import { countryTag, dateTime, ikeaOfferUrl, money } from "@/lib/format.ts";
import type { Alert, AlertPage } from "@/server/watchlist.ts";

const PAGE = 50;

function Delivery({ alert }: { alert: Alert }) {
  if (!alert.delivery) return <span className="meta">bezig…</span>;
  return (
    <span className={alert.delivery.includes("fout") ? "err" : ""}>
      {alert.delivery}
    </span>
  );
}

export function AlertsPage() {
  const [items, setItems] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [unseen, setUnseen] = useState(0);

  const load = useCallback(async () => {
    const data = await api<AlertPage>(
      `/api/alerts?limit=${String(PAGE)}&offset=0`,
    );
    setItems(data.items);
    setTotal(data.total);
    setUnseen(data.unseen);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    const data = await api<AlertPage>(
      `/api/alerts?limit=${String(PAGE)}&offset=${String(items.length)}`,
    );
    setItems((current) => [...current, ...data.items]);
  };

  return (
    <main className="alerts-page">
      <h1>Meldingen</h1>
      <p className="lead">
        Geschiedenis van alle meldingen: wanneer een watchlist-product in een
        gevolgd filiaal verscheen en waar de melding naartoe is gestuurd.
      </p>
      <div className="row">
        <span className="hint">{`${String(total)} meldingen · ${String(unseen)} ongezien`}</span>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void send("/api/alerts/seen", "POST").then(async () => {
              await load();
              notifyAlertsChanged();
            });
          }}
        >
          Alles gezien
        </button>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Wanneer</th>
              <th>Product</th>
              <th>Filiaal</th>
              <th>Prijs</th>
              <th>Prijsvergelijking</th>
              <th>Verzonden via</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <Empty>Nog geen meldingen.</Empty>
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr
                  key={`${a.storeId}-${a.offerNumber}-${String(a.createdAt)}`}
                  className={a.seen ? "" : "unseen"}
                >
                  <td>{dateTime(a.createdAt)}</td>
                  <td>
                    <Link href={`/product/${a.articleNumber}`}>{a.title}</Link>
                    <div className="meta">{a.description}</div>
                  </td>
                  <td>{a.storeName + countryTag(a.country)}</td>
                  <td>
                    <strong>{money(a.price)}</strong>
                  </td>
                  <td>{a.note || "–"}</td>
                  <td>
                    <Delivery alert={a} />
                  </td>
                  <td>
                    <a
                      href={ikeaOfferUrl(a.storeName, a.offerNumber, a.country)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconLabel name="external">IKEA</IconLabel>
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {items.length < total ? (
        <p>
          <button
            type="button"
            className="secondary"
            onClick={() => void loadMore()}
          >
            Meer laden
          </button>
        </p>
      ) : null}
    </main>
  );
}
