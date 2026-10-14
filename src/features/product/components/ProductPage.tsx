"use client";

import "../product.css";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Chip, TagChip } from "@/components/ui/Chip.tsx";
import { useDialogs } from "@/components/ui/DialogProvider.tsx";
import { Empty } from "@/components/ui/Empty.tsx";
import { IconLabel } from "@/components/ui/Icon.tsx";
import { groupOffers } from "@/features/offers/components/OfferViews.tsx";
import { api, errorMessage, send } from "@/lib/api-client.ts";
import {
  ago,
  countryTag,
  dateTime,
  ikeaOfferUrl,
  money,
} from "@/lib/format.ts";
import type { ArticleInsight, PricePoint } from "@/server/db.ts";

type Product = {
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  url: string | undefined;
  watched: boolean;
  insight: ArticleInsight | undefined;
  history: PricePoint[];
};

type Group = ReturnType<typeof groupOffers>[number];

function OfferSection({
  title,
  groups,
  emptyText,
}: {
  title: string;
  groups: Group[];
  emptyText: string;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <Empty>{emptyText}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Filiaal</th>
                <th>Prijs</th>
                <th>Nieuwprijs</th>
                <th>Staat</th>
                <th>Prijs t.o.v. laagste</th>
                <th>Sinds</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.storeId}-${g.offerNumber}`}>
                  <td>
                    <strong>{g.storeName + countryTag(g.country)}</strong>
                    {g.count > 1 ? (
                      <span className="meta">{` ×${String(g.count)}`}</span>
                    ) : null}
                  </td>
                  <td>
                    <strong>{money(g.price, g.currency)}</strong>
                  </td>
                  <td>
                    {g.originalPrice ? money(g.originalPrice, g.currency) : "–"}
                  </td>
                  <td>
                    {[g.condition, g.reason].filter(Boolean).join(" · ") || "–"}
                  </td>
                  <td>
                    {g.tag && g.tag.kind !== "equal" ? (
                      <TagChip tag={g.tag} />
                    ) : (
                      <span className="meta">–</span>
                    )}
                  </td>
                  <td>{ago(g.firstSeen)}</td>
                  <td>
                    <a
                      href={ikeaOfferUrl(g.storeName, g.offerNumber, g.country)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconLabel name="external">Bekijk bij IKEA</IconLabel>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ProductPage({ article }: { article: string }) {
  const router = useRouter();
  const dialogs = useDialogs();
  const [product, setProduct] = useState<Product | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setProduct(await api<Product>(`/api/product/${article}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [article]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (product) {
      document.title = `${product.name} ${product.typeName} · Tweedekanshoek`;
    }
  }, [product]);

  if (error) {
    return (
      <main className="product-page">
        <Empty>{`Product niet gevonden (${error})`}</Empty>
      </main>
    );
  }
  if (!product) {
    return (
      <main className="product-page">
        <Empty>Laden…</Empty>
      </main>
    );
  }

  const offers = product.insight?.offers ?? [];
  const groups = groupOffers(offers);
  const cheapest = [...offers].sort((a, b) => a.price - b.price)[0];

  // One row per (filiaal, prijs, meting) instead of one per offer.
  const history = new Map<string, PricePoint & { count: number }>();
  for (const h of product.history) {
    const key = `${h.storeId}|${String(h.price)}|${String(h.measuredAt)}`;
    const existing = history.get(key);
    if (existing) existing.count += 1;
    else history.set(key, { ...h, count: 1 });
  }

  const toggleWatch = async () => {
    setBusy(true);
    try {
      if (product.watched) {
        await send(`/api/watchlist/${product.articleNumber}`, "DELETE");
      } else {
        await send("/api/watchlist", "PUT", product);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="product-page">
      <p>
        <button
          type="button"
          className="link"
          onClick={() => {
            router.back();
          }}
        >
          <IconLabel name="arrow">Terug</IconLabel>
        </button>
      </p>
      <div className="product-hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- IKEA CDN images */}
        <img src={product.image ?? ""} alt="" />
        <div>
          <h1>{`${product.name} ${product.typeName}`}</h1>
          <p className="lead">
            {`Artikelnummer ${product.articleNumber}${product.measure ? ` · ${product.measure}` : ""}`}
          </p>
          <div className="chips" style={{ marginBottom: 12 }}>
            <Chip {...(offers.length > 0 ? { kind: "info" as const } : {})}>
              {`${String(offers.length)} in tweedekanshoek`}
            </Chip>
            {cheapest ? (
              <Chip kind="good">
                {`Laagste nu: ${money(cheapest.price, cheapest.currency)} in ${cheapest.storeName}${countryTag(cheapest.country)}`}
              </Chip>
            ) : null}
            {product.insight?.lowestEver !== undefined ? (
              <Chip>{`Laagste ooit gemeten: ${money(product.insight.lowestEver)}`}</Chip>
            ) : null}
          </div>
          <div className="row">
            <button
              type="button"
              className={product.watched ? "secondary" : ""}
              disabled={busy}
              onClick={() => void toggleWatch()}
            >
              {product.watched ? "Verwijder van watchlist" : "Volgen"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                dialogs.addToList(product);
              }}
            >
              Op lijst
            </button>
            {product.url ? (
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                Productpagina op IKEA.nl
              </a>
            ) : null}
            {cheapest ? (
              <a
                href={ikeaOfferUrl(
                  cheapest.storeName,
                  cheapest.offerNumber,
                  cheapest.country,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconLabel name="external">
                  {`Goedkoopste aanbieding bij IKEA (${cheapest.storeName}${countryTag(cheapest.country)})`}
                </IconLabel>
              </a>
            ) : null}
          </div>
        </div>
      </div>
      <OfferSection
        title="Gevolgde filialen"
        groups={groups.filter((g) => g.followed)}
        emptyText="Niet beschikbaar in een gevolgd filiaal."
      />
      <OfferSection
        title="Overige filialen"
        groups={groups.filter((g) => !g.followed)}
        emptyText="Niet beschikbaar in overige filialen."
      />
      <section className="panel">
        <h2>Prijsgeschiedenis</h2>
        {history.size === 0 ? (
          <Empty>Nog geen prijzen gemeten.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gemeten</th>
                  <th>Filiaal</th>
                  <th>Prijs</th>
                  <th>Aantal</th>
                </tr>
              </thead>
              <tbody>
                {[...history.entries()].map(([key, h]) => (
                  <tr key={key}>
                    <td>{dateTime(h.measuredAt)}</td>
                    <td>{h.storeName}</td>
                    <td>{money(h.price)}</td>
                    <td>{`×${String(h.count)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
