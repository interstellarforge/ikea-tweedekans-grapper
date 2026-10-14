import { authed, HttpError } from "@/server/api.ts";
import {
  articleInsights,
  offerProductInfo,
  priceHistory,
} from "@/server/db.ts";
import { type CatalogProduct, searchCatalog } from "@/server/ikea-client.ts";
import { listWatchItems } from "@/server/watchlist.ts";

const ARTICLE_NUMBER = /^\d{8}$/;

export const GET = authed(async ({ db, user, ctx, params }) => {
  const articleNumber = params["article"] ?? "";
  if (!ARTICLE_NUMBER.test(articleNumber)) {
    throw new HttpError(404, "unknown product");
  }
  let product: CatalogProduct | undefined;
  try {
    product = (await searchCatalog(articleNumber)).find(
      (p) => p.articleNumber === articleNumber,
    );
  } catch (error) {
    console.error("[product] catalog lookup failed:", error);
  }
  const fallback = offerProductInfo(db, articleNumber);
  if (!product && !fallback) throw new HttpError(404, "unknown product");
  return {
    articleNumber,
    name: product?.name ?? fallback?.title ?? articleNumber,
    typeName: product?.typeName ?? fallback?.description ?? "",
    measure: product?.measure ?? "",
    image: product?.image ?? fallback?.image,
    url: product?.url,
    watched: listWatchItems(db, user.id, ctx.countries).some(
      (w) => w.articleNumber === articleNumber,
    ),
    insight: articleInsights(db, ctx, [articleNumber])[articleNumber],
    history: priceHistory(db, articleNumber),
  };
});
