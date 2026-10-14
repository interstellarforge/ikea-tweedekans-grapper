import { authed } from "@/server/api.ts";
import { searchOffers } from "@/server/db.ts";
import { bump } from "@/server/stats.ts";
import { nonEmpty } from "@/server/strings.ts";

const HOUR_MS = 3_600_000;

const number = (v: string | null): number | undefined =>
  v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;

export const GET = authed(({ db, ctx, url }) => {
  const q = url.searchParams.get("q") ?? "";
  if (q.trim() !== "") bump(db, "search_offers");
  const hours = number(url.searchParams.get("newHours"));
  const sort = url.searchParams.get("sort");
  const scope = url.searchParams.get("followed");
  return searchOffers(db, ctx, {
    q: nonEmpty(q),
    storeId: nonEmpty(url.searchParams.get("store") ?? undefined),
    scope: scope === "1" ? "followed" : scope === "0" ? "others" : undefined,
    sinceMs: hours ? Date.now() - hours * HOUR_MS : undefined,
    sort:
      sort === "priceAsc" || sort === "priceDesc" || sort === "discount"
        ? sort
        : "new",
    limit: number(url.searchParams.get("limit")),
    offset: number(url.searchParams.get("offset")),
  });
});
