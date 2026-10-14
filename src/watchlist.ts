import type { DatabaseSync } from "node:sqlite";

import type { CatalogProduct } from "./ikea-client.ts";

export type WatchItem = CatalogProduct & {
  addedAt: number;
  availableNow: number;
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
};

export function addWatchItem(
  db: DatabaseSync,
  p: CatalogProduct,
  now: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO watch_items (article_number, name, type_name, measure, image, url, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.articleNumber,
    p.name,
    p.typeName,
    p.measure,
    p.image ?? null,
    p.url ?? null,
    now,
  );
}

export function removeWatchItem(db: DatabaseSync, articleNumber: string): void {
  db.prepare("DELETE FROM watch_items WHERE article_number = ?").run(
    articleNumber,
  );
}

export function listWatchItems(db: DatabaseSync): WatchItem[] {
  const rows = db
    .prepare(
      `SELECT w.article_number AS articleNumber, w.name, w.type_name AS typeName, w.measure,
              w.image, w.url, w.added_at AS addedAt,
              (SELECT COUNT(*) FROM offers o
                 WHERE o.article_number = w.article_number AND o.active = 1) AS availableNow
       FROM watch_items w ORDER BY w.added_at DESC`,
    )
    .all() as (Omit<WatchItem, "image" | "url"> & {
    image: string | null;
    url: string | null;
  })[];
  return rows.map((r) => ({
    ...r,
    image: r.image ?? undefined,
    url: r.url ?? undefined,
  }));
}

export function isWatched(db: DatabaseSync, articleNumber: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM watch_items WHERE article_number = ?")
      .get(articleNumber) !== undefined
  );
}

export function recordAlert(db: DatabaseSync, alert: Alert): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO alerts (store_id, offer_number, article_number, title, description, price, store_name, created_at, seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      alert.storeId,
      alert.offerNumber,
      alert.articleNumber,
      alert.title,
      alert.description,
      alert.price,
      alert.storeName,
      alert.createdAt,
    );
  return res.changes > 0;
}

export function listAlerts(db: DatabaseSync, limit = 100): Alert[] {
  const rows = db
    .prepare(
      `SELECT store_id AS storeId, offer_number AS offerNumber, article_number AS articleNumber,
              title, description, price, store_name AS storeName, created_at AS createdAt, seen
       FROM alerts ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as (Omit<Alert, "seen"> & { seen: number })[];
  return rows.map((r) => ({ ...r, seen: r.seen === 1 }));
}

export function markAlertsSeen(db: DatabaseSync): void {
  db.prepare("UPDATE alerts SET seen = 1 WHERE seen = 0").run();
}
