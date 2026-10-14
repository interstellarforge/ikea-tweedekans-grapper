"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import { Empty } from "@/components/ui/Empty.tsx";
import { useDebouncedValue } from "@/hooks/useDebouncedValue.ts";
import { api, errorMessage } from "@/lib/api-client.ts";
import type { StoredOffer, StoreRow } from "@/server/db.ts";

import { OfferCard } from "./OfferViews.tsx";

const PAGE = 60;

type OfferPage = { total: number; items: StoredOffer[] };

type Filters = {
  q: string;
  store: string;
  followed: string;
  recent: string;
  sort: string;
};

export function OffersPage() {
  const [filters, setFilters] = useState<Filters>({
    q: "",
    store: "",
    followed: "",
    recent: "",
    sort: "new",
  });
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [items, setItems] = useState<StoredOffer[] | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const q = useDebouncedValue(filters.q);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void api<StoreRow[]>("/api/stores").then(setStores);
  }, []);

  const params = useCallback(
    (offset: number) =>
      new URLSearchParams({
        q,
        store: filters.store,
        followed: filters.followed,
        newHours: filters.recent,
        sort: filters.sort,
        limit: String(PAGE),
        offset: String(offset),
      }),
    [q, filters.store, filters.followed, filters.recent, filters.sort],
  );

  useEffect(() => {
    let cancelled = false;
    api<OfferPage>(`/api/offers?${params(0).toString()}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setStatus(`${String(data.total)} aanbiedingen`);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(`Fout: ${errorMessage(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const loadMore = async () => {
    const data = await api<OfferPage>(
      `/api/offers?${params(items?.length ?? 0).toString()}`,
    );
    setItems((current) => [...(current ?? []), ...data.items]);
  };

  const set = (key: keyof Filters) => (value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const followedStores = stores.filter((s) => s.followed);
  const otherStores = stores.filter((s) => !s.followed);
  const storeOptions = (list: StoreRow[]) =>
    list.map((s) => (
      <option key={s.storeId} value={s.storeId}>
        {`${s.name} (${String(s.activeOffers)})`}
      </option>
    ));

  return (
    <main>
      <h1>Aanbod</h1>
      <p className="lead">
        Alle opgehaalde tweedekansproducten van alle filialen, met
        prijsvergelijking t.o.v. eerder gemeten prijzen.
      </p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Zoek op naam, omschrijving of artikelnummer"
          aria-label="Zoeken in het aanbod"
          value={filters.q}
          onChange={(event) => {
            set("q")(event.target.value);
          }}
        />
        <select
          aria-label="Filiaal"
          value={filters.store}
          onChange={(event) => {
            set("store")(event.target.value);
          }}
        >
          <option value="">Alle filialen</option>
          {followedStores.length > 0 ? (
            <optgroup label="Gevolgde filialen">
              {storeOptions(followedStores)}
            </optgroup>
          ) : null}
          {otherStores.length > 0 ? (
            <optgroup label="Overige filialen">
              {storeOptions(otherStores)}
            </optgroup>
          ) : null}
        </select>
        <select
          aria-label="Gevolgd of overig"
          value={filters.followed}
          onChange={(event) => {
            set("followed")(event.target.value);
          }}
        >
          <option value="">Gevolgde + overige filialen</option>
          <option value="1">Alleen gevolgde filialen</option>
          <option value="0">Alleen overige filialen</option>
        </select>
        <select
          aria-label="Nieuw"
          value={filters.recent}
          onChange={(event) => {
            set("recent")(event.target.value);
          }}
        >
          <option value="">Altijd</option>
          <option value="24">Nieuw &lt; 24 uur</option>
          <option value="72">Nieuw &lt; 3 dagen</option>
          <option value="168">Nieuw &lt; 7 dagen</option>
        </select>
        <select
          aria-label="Sorteren"
          value={filters.sort}
          onChange={(event) => {
            set("sort")(event.target.value);
          }}
        >
          <option value="new">Nieuwste eerst</option>
          <option value="priceAsc">Prijs: laag naar hoog</option>
          <option value="priceDesc">Prijs: hoog naar laag</option>
          <option value="discount">Grootste korting</option>
        </select>
      </div>
      <div className="hint">{status}</div>
      <div className="grid">
        {items?.length === 0 ? (
          <Empty>Geen aanbiedingen gevonden.</Empty>
        ) : null}
        {items?.map((offer, index) => {
          const previous = items[index - 1];
          const heading =
            index === 0 || previous?.followed !== offer.followed ? (
              <h2 className="group-title">
                {offer.followed ? "Gevolgde filialen" : "Overige filialen"}
              </h2>
            ) : null;
          return (
            <Fragment key={`${offer.storeId}-${offer.offerNumber}`}>
              {heading}
              <OfferCard offer={offer} now={now} />
            </Fragment>
          );
        })}
      </div>
      {items && items.length < total ? (
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
