"use client";

import "../catalog.css";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useDialogs } from "@/components/ui/DialogProvider.tsx";
import { Empty } from "@/components/ui/Empty.tsx";
import { InsightChips } from "@/features/offers/components/OfferViews.tsx";
import { useDebouncedValue } from "@/hooks/useDebouncedValue.ts";
import { api, errorMessage, send } from "@/lib/api-client.ts";
import type { ArticleInsight } from "@/server/db.ts";
import type { CatalogProduct } from "@/server/ikea-client.ts";

type CatalogItem = CatalogProduct & {
  watched: boolean;
  insight: ArticleInsight | undefined;
};

type SearchResult = {
  q: string;
  items?: CatalogItem[];
  error?: string;
};

const MIN_QUERY = 2;

const STARTERS: [string, string[]][] = [
  ["Keuken", ["METOD", "SEKTION", "KNOXHULT", "ENHET"]],
  ["Kasten en opbergen", ["PAX", "BILLY", "KALLAX", "BESTÅ", "IVAR"]],
  ["Slaapkamer", ["MALM", "HEMNES", "BRIMNES", "SONGESAND"]],
  ["Wonen en werken", ["LACK", "POÄNG", "ALEX", "MICKE", "LINNMON"]],
  ["Onderdelen", ["KOMPLEMENT", "UTRUSTA", "MAXIMERA", "RATIONELL"]],
];

export function CatalogPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | undefined>(undefined);
  const q = useDebouncedValue(query.trim());
  const searching = q.length >= MIN_QUERY;

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    api<CatalogItem[]>(`/api/catalog?q=${encodeURIComponent(q)}`)
      .then((items) => {
        if (!cancelled) setResult({ q, items });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ q, error: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [q, searching]);

  const current = searching && result?.q === q ? result : undefined;
  const items = current?.items;
  const status = !searching
    ? ""
    : current === undefined
      ? "Zoeken…"
      : current.error === undefined
        ? `${String(items?.length ?? 0)} producten`
        : `Zoeken mislukt: ${current.error}`;

  return (
    <main className="catalog-page">
      <h1>Zoeken in producten</h1>
      <p className="lead">
        Zoek in de volledige IKEA-catalogus (naam of artikelnummer) en zet
        producten op je watchlist.
      </p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Bijv. KALLAX, BILLY, 90591705"
          aria-label="Zoek in de catalogus"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>
      <div className="hint">{status}</div>
      {searching ? null : (
        <section className="starter">
          <h2>Veelgezocht</h2>
          <p className="lead">
            Kies een serie of zoek op naam of artikelnummer. Series die vaak in
            de tweedekanshoek liggen staan hieronder.
          </p>
          {STARTERS.map(([title, names]) => (
            <div className="starter-group" key={title}>
              <h3>{title}</h3>
              <div className="chips">
                {names.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="pill"
                    onClick={() => {
                      setQuery(name);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <div className="grid">
        {searching && items?.length === 0 ? (
          <Empty>Geen producten gevonden.</Empty>
        ) : null}
        {searching
          ? items?.map((p) => <ProductCard key={p.articleNumber} product={p} />)
          : null}
      </div>
    </main>
  );
}

function ProductCard({ product: p }: { product: CatalogItem }) {
  const dialogs = useDialogs();
  const [watched, setWatched] = useState(p.watched);
  return (
    <div className="card">
      <Link href={`/product/${p.articleNumber}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- IKEA CDN images */}
        <img src={p.image ?? ""} loading="lazy" alt="" />
      </Link>
      <div className="body">
        <Link
          className="title"
          href={`/product/${p.articleNumber}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {`${p.name} ${p.typeName}`}
        </Link>
        <div className="meta">
          {`art. ${p.articleNumber}${p.measure ? ` · ${p.measure}` : ""}`}
        </div>
        <InsightChips insight={p.insight} />
        <div className="spacer" />
        <div className="row" style={{ margin: 0 }}>
          <button
            type="button"
            disabled={watched}
            onClick={() => {
              setWatched(true);
              void send("/api/watchlist", "PUT", p);
            }}
          >
            {watched ? "Op watchlist" : "Volgen"}
          </button>
          <button
            type="button"
            className="secondary"
            title="Op een boodschappenlijst zetten"
            onClick={() => {
              dialogs.addToList(p);
            }}
          >
            Op lijst
          </button>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              Op IKEA.nl
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
