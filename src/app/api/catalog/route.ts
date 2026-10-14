import { authed } from "@/server/api.ts";
import { articleInsights } from "@/server/db.ts";
import { searchCatalog } from "@/server/ikea-client.ts";
import { bump } from "@/server/stats.ts";
import { listWatchItems } from "@/server/watchlist.ts";

const MIN_QUERY = 2;

export const GET = authed(async ({ db, user, ctx, url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) return [];
  bump(db, "search_catalog");
  const products = await searchCatalog(q);
  const insights = articleInsights(
    db,
    ctx,
    products.map((p) => p.articleNumber),
  );
  const watched = new Set(
    listWatchItems(db, user.id, ctx.countries).map((w) => w.articleNumber),
  );
  return products.map((p) => ({
    ...p,
    watched: watched.has(p.articleNumber),
    insight: insights[p.articleNumber],
  }));
});
