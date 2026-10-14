import type { DatabaseSync } from "node:sqlite";

import type { CatalogProduct } from "./ikea-client.ts";

export type WatchItem = CatalogProduct & {
  addedAt: number;
  availableNow: number;
  /** Manual quantity (used when the article is on no shopping list). */
  quantity: number;
  bought: number;
  /** Pieces still needed: from shopping lists when listed there, else the manual quantity. */
  needed: number;
  /** Shopping lists this article is on, with the pieces still needed per list. */
  lists: { listId: number; listName: string; remaining: number }[];
};

export type Alert = {
  storeId: string;
  offerNumber: string;
  articleNumber: string;
  title: string;
  description: string;
  price: number;
  storeName: string;
  createdAt: number;
  seen: boolean;
  country: string;
  /** Price comparison at alert time, e.g. "nieuwe laagste prijs (eerder €5,20)". */
  note: string;
  /** Delivery result per channel, e.g. "ntfy: ok · e-mail: fout: timeout". Empty while sending. */
  delivery: string;
};

export function addWatchItem(
  db: DatabaseSync,
  userId: number,
  p: CatalogProduct,
  now: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO watch_items (user_id, article_number, name, type_name, measure, image, url, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    p.articleNumber,
    p.name,
    p.typeName,
    p.measure,
    p.image ?? null,
    p.url ?? null,
    now,
  );
}

export function removeWatchItem(
  db: DatabaseSync,
  userId: number,
  articleNumber: string,
): void {
  db.prepare(
    "DELETE FROM watch_items WHERE user_id = ? AND article_number = ?",
  ).run(userId, articleNumber);
}

/** The user's watchlist; availability only counts stores of the given countries. */
export function listWatchItems(
  db: DatabaseSync,
  userId: number,
  countries: string[],
): WatchItem[] {
  const marks = countries.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT w.article_number AS articleNumber, w.name, w.type_name AS typeName, w.measure,
              w.image, w.url, w.added_at AS addedAt, w.quantity, w.bought,
              (SELECT COUNT(*) FROM offers o JOIN stores s ON s.store_id = o.store_id
                 WHERE o.article_number = w.article_number AND o.active = 1
                   AND s.country IN (${marks})) AS availableNow,
              (SELECT n.needed FROM watch_need n
                 WHERE n.user_id = w.user_id AND n.article_number = w.article_number) AS needed
       FROM watch_items w WHERE w.user_id = ? ORDER BY w.added_at DESC`,
    )
    .all(...countries, userId) as (Omit<
    WatchItem,
    "image" | "url" | "lists"
  > & {
    image: string | null;
    url: string | null;
  })[];
  const onLists = db.prepare(
    `SELECT l.id AS listId, l.name AS listName,
            MAX(0, li.quantity - COALESCE((SELECT SUM(p.quantity) FROM purchases p WHERE p.list_item_id = li.id), 0)) AS remaining
     FROM list_items li JOIN lists l ON l.id = li.list_id
     WHERE l.user_id = ? AND li.article_number = ? ORDER BY l.id`,
  );
  return rows.map((r) => ({
    ...r,
    image: r.image ?? undefined,
    url: r.url ?? undefined,
    lists: onLists.all(userId, r.articleNumber) as WatchItem["lists"],
  }));
}

export function setQuantity(
  db: DatabaseSync,
  userId: number,
  articleNumber: string,
  quantity: number,
): void {
  db.prepare(
    "UPDATE watch_items SET quantity = ? WHERE user_id = ? AND article_number = ?",
  ).run(Math.min(Math.max(Math.round(quantity), 1), 99), userId, articleNumber);
}

export function setBought(
  db: DatabaseSync,
  userId: number,
  articleNumber: string,
  bought: number,
): void {
  db.prepare(
    "UPDATE watch_items SET bought = MAX(0, MIN(quantity, ?)) WHERE user_id = ? AND article_number = ?",
  ).run(Math.round(bought), userId, articleNumber);
}

/** Ticks off units of watchlist-only items; never goes beyond the quantity needed. */
export function markPurchased(
  db: DatabaseSync,
  userId: number,
  items: { articleNumber: string; count: number }[],
): void {
  const stmt = db.prepare(
    "UPDATE watch_items SET bought = MIN(quantity, bought + ?) WHERE user_id = ? AND article_number = ?",
  );
  for (const item of items) {
    if (item.count >= 1) {
      stmt.run(Math.round(item.count), userId, item.articleNumber);
    }
  }
}

/** True while this user still has something left to buy of this watched article. */
export function isWatched(
  db: DatabaseSync,
  userId: number,
  articleNumber: string,
): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM watch_need WHERE user_id = ? AND article_number = ? AND needed > 0",
      )
      .get(userId, articleNumber) !== undefined
  );
}

export function recordAlert(
  db: DatabaseSync,
  userId: number,
  alert: Alert,
): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO alerts (user_id, store_id, offer_number, article_number, title, description, price, store_name, created_at, seen, note, delivery, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      userId,
      alert.storeId,
      alert.offerNumber,
      alert.articleNumber,
      alert.title,
      alert.description,
      alert.price,
      alert.storeName,
      alert.createdAt,
      alert.note,
      alert.delivery,
      alert.country,
    );
  return res.changes > 0;
}

export function setAlertDelivery(
  db: DatabaseSync,
  userId: number,
  storeId: string,
  offerNumber: string,
  delivery: string,
): void {
  db.prepare(
    "UPDATE alerts SET delivery = ? WHERE user_id = ? AND store_id = ? AND offer_number = ?",
  ).run(delivery, userId, storeId, offerNumber);
}

export type AlertPage = { total: number; unseen: number; items: Alert[] };

/** One user's alert history, newest first. */
export function listAlerts(
  db: DatabaseSync,
  userId: number,
  limit = 50,
  offset = 0,
): AlertPage {
  const counts = db
    .prepare(
      "SELECT COUNT(*) AS total, ifnull(SUM(seen = 0), 0) AS unseen FROM alerts WHERE user_id = ?",
    )
    .get(userId) as { total: number; unseen: number };
  const rows = db
    .prepare(
      `SELECT store_id AS storeId, offer_number AS offerNumber, article_number AS articleNumber,
              title, description, price, store_name AS storeName, created_at AS createdAt, seen,
              note, delivery, country
       FROM alerts WHERE user_id = ?
       ORDER BY created_at DESC, offer_number LIMIT ? OFFSET ?`,
    )
    .all(
      userId,
      Math.min(Math.max(limit, 1), 200),
      Math.max(offset, 0),
    ) as (Omit<Alert, "seen"> & { seen: number })[];
  return {
    ...counts,
    items: rows.map((r) => ({ ...r, seen: r.seen === 1 })),
  };
}

export function markAlertsSeen(db: DatabaseSync, userId: number): void {
  db.prepare("UPDATE alerts SET seen = 1 WHERE user_id = ? AND seen = 0").run(
    userId,
  );
}
