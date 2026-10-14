import Link from "next/link";

import { Chip, TagChip } from "@/components/ui/Chip.tsx";
import { ago, countryTag, money, OFFERS_URL } from "@/lib/format.ts";
import type { ArticleInsight, StoredOffer } from "@/server/db.ts";

type GroupedOffer = StoredOffer & { count: number };

const DAY_MS = 86_400_000;
const MAX_INSIGHT_ROWS = 3;

/** Collapses identical offers (same store, price, tag) and puts followed stores first. */
export function groupOffers(offers: StoredOffer[]): GroupedOffer[] {
  const groups = new Map<string, GroupedOffer>();
  for (const o of offers) {
    const key = [
      o.storeId,
      o.price,
      o.condition,
      o.reason,
      o.originalPrice,
    ].join("|");
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.firstSeen = Math.min(group.firstSeen, o.firstSeen);
    } else {
      groups.set(key, { ...o, count: 1 });
    }
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.followed) - Number(a.followed) || a.price - b.price,
  );
}

export function StoreChip({
  offer,
}: {
  offer: Pick<StoredOffer, "storeName" | "country" | "followed">;
}) {
  return (
    <Chip
      {...(offer.followed
        ? { kind: "info" as const, icon: "star" as const }
        : {})}
    >
      {`${offer.storeName}${countryTag(offer.country)}`}
    </Chip>
  );
}

/** Chips for a catalog article: where it lies and at which price, plus price comparison. */
export function InsightChips({
  insight,
  max = MAX_INSIGHT_ROWS,
}: {
  insight: ArticleInsight | undefined;
  max?: number;
}) {
  if (!insight) return null;
  const groups = groupOffers(insight.offers);
  return (
    <>
      {groups.slice(0, max).map((g) => (
        <div
          className="chips"
          key={`${g.storeId}-${String(g.price)}-${g.offerNumber}`}
        >
          <Chip
            {...(g.followed
              ? { kind: "info" as const, icon: "star" as const }
              : {})}
          >
            {`${g.count > 1 ? `${String(g.count)}× ` : ""}${g.storeName}${countryTag(g.country)} · ${money(g.price, g.currency)}`}
          </Chip>
          <TagChip tag={g.tag} />
        </div>
      ))}
      {groups.length > max ? (
        <div className="chips">
          <Chip>{`+${String(groups.length - max)} meer`}</Chip>
        </div>
      ) : null}
      {insight.lowestEver !== undefined && insight.offers.length === 0 ? (
        <div className="chips">
          <Chip>{`Laagste eerder gemeten: ${money(insight.lowestEver)}`}</Chip>
        </div>
      ) : null}
    </>
  );
}

export function OfferCard({
  offer: o,
  now,
}: {
  offer: StoredOffer;
  now: number;
}) {
  const isNew = now - o.firstSeen < DAY_MS;
  return (
    <Link
      className="card"
      href={o.articleNumber ? `/product/${o.articleNumber}` : OFFERS_URL}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- IKEA CDN images, no known domains to allow-list */}
      <img src={o.image ?? ""} loading="lazy" alt="" />
      <div className="body">
        <div className="title">{o.title}</div>
        <div className="meta">{o.description}</div>
        <div>
          <span className="price">{money(o.price, o.currency)}</span>
          {o.originalPrice ? (
            <span className="old">{money(o.originalPrice, o.currency)}</span>
          ) : null}
        </div>
        <div className="chips">
          {isNew ? <Chip kind="new">Nieuw</Chip> : null}
          <StoreChip offer={o} />
          {o.condition ? <Chip>{o.condition}</Chip> : null}
          <TagChip tag={o.tag} />
        </div>
        <div className="meta">
          {`art. ${o.articleNumber ?? "–"} · aanbieding ${o.offerNumber} · ${ago(o.firstSeen)}`}
        </div>
      </div>
    </Link>
  );
}
