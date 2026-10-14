"use client";

import Link from "next/link";

import { Chip } from "@/components/ui/Chip.tsx";
import { Empty } from "@/components/ui/Empty.tsx";
import { IconLabel } from "@/components/ui/Icon.tsx";
import { IconButton } from "@/components/ui/IconButton.tsx";
import { Stepper } from "@/components/ui/Stepper.tsx";
import { InsightChips } from "@/features/offers/components/OfferViews.tsx";
import { send } from "@/lib/api-client.ts";
import { money } from "@/lib/format.ts";
import type { ArticleInsight } from "@/server/db.ts";
import type { WatchItem } from "@/server/watchlist.ts";

export type WatchView = WatchItem & { insight: ArticleInsight | undefined };

export function WatchGrid({
  items,
  onChanged,
  onBuy,
}: {
  items: WatchView[];
  onChanged: () => void;
  onBuy: (item: WatchView) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="grid">
        <Empty>
          Nog niets op je watchlist. Zoek een product onder &quot;Zoeken in
          producten&quot; of zet items van een boodschappenlijst op de
          watchlist.
        </Empty>
      </div>
    );
  }
  return (
    <div className="grid">
      {items.map((item) => (
        <WatchCard
          key={item.articleNumber}
          item={item}
          onChanged={onChanged}
          onBuy={onBuy}
        />
      ))}
    </div>
  );
}

function WatchCard({
  item,
  onChanged,
  onBuy,
}: {
  item: WatchView;
  onChanged: () => void;
  onBuy: (item: WatchView) => void;
}) {
  const manual = item.lists.length === 0;
  const hasOffers = (item.insight?.offers.length ?? 0) > 0;
  const setQuantity = (quantity: number) => {
    void send(`/api/watchlist/${item.articleNumber}/quantity`, "PUT", {
      quantity,
    }).then(onChanged);
  };

  return (
    <div className="card wcard">
      <IconButton
        name="trash"
        label="Van watchlist halen"
        tone="danger"
        className="corner"
        onClick={() => {
          void send(`/api/watchlist/${item.articleNumber}`, "DELETE").then(
            onChanged,
          );
        }}
      />
      <Link href={`/product/${item.articleNumber}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- IKEA CDN images */}
        <img src={item.image ?? ""} loading="lazy" alt="" />
      </Link>
      <div className="body">
        <Link
          className="title"
          href={`/product/${item.articleNumber}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {`${item.name} ${item.typeName}`.trim()}
        </Link>
        <div className="meta">
          {`art. ${item.articleNumber}${item.measure ? ` · ${item.measure}` : ""}`}
        </div>
        {hasOffers || item.insight?.lowestEver !== undefined ? (
          <InsightChips insight={item.insight} />
        ) : (
          <div className="chips">
            <Chip>Niet in tweedekanshoek</Chip>
          </div>
        )}
        {item.insight?.lowestEver !== undefined && hasOffers ? (
          <div className="meta">{`Laagste ooit gemeten: ${money(item.insight.lowestEver)}`}</div>
        ) : null}
        <div className="spacer" />
        {manual ? (
          <Stepper value={item.quantity} onChange={setQuantity}>
            <span className="meta">nodig</span>
          </Stepper>
        ) : (
          <div className="chips">
            <Chip kind={item.needed > 0 ? "info" : "good"}>
              {item.needed > 0
                ? `Nog nodig: ${String(item.needed)}`
                : "Alles gekocht"}
            </Chip>
            {item.lists.map((l) => (
              <Chip
                key={l.listId}
              >{`${l.listName}: ${String(l.remaining)}`}</Chip>
            ))}
          </div>
        )}
        {item.needed > 0 ? (
          <button
            type="button"
            className="secondary mini"
            onClick={() => {
              onBuy(item);
            }}
          >
            <IconLabel name="check">Gekocht</IconLabel>
          </button>
        ) : null}
      </div>
    </div>
  );
}
