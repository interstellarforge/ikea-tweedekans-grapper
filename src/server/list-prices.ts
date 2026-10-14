import type { Db } from "./db.ts";
import { searchCatalog } from "./ikea-client.ts";

let refreshing = false;

/** Fetches the regular price from IKEA's catalog for list items that have none yet (background). */
export function refreshListPrices(db: Db): void {
  if (refreshing) return;
  const missing = db
    .prepare(
      "SELECT DISTINCT article_number AS article FROM list_items WHERE normal_price IS NULL LIMIT 8",
    )
    .all() as { article: string }[];
  if (missing.length === 0) return;
  refreshing = true;
  void Promise.allSettled(
    missing.map(async ({ article }) => {
      const found = (await searchCatalog(article)).find(
        (p) => p.articleNumber === article,
      );
      if (found?.price !== undefined) {
        db.prepare(
          "UPDATE list_items SET normal_price = ? WHERE article_number = ?",
        ).run(found.price, article);
      }
    }),
  ).finally(() => {
    refreshing = false;
  });
}
