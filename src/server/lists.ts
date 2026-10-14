import type { DatabaseSync } from "node:sqlite";

import { markPurchased } from "./watchlist.ts";

export type ListProduct = {
  articleNumber: string;
  name: string;
  typeName: string;
  measure: string;
  image: string | undefined;
  url: string | undefined;
  /** Regular (new) price, when known. */
  normalPrice: number | undefined;
};

export type PurchaseView = {
  id: number;
  quantity: number;
  /** Price paid per piece; undefined when it was not recorded. */
  unitPrice: number | undefined;
  storeName: string | undefined;
  purchasedAt: number;
};

export type ListItemView = ListProduct & {
  id: number;
  quantity: number;
  bought: number;
  remaining: number;
  purchases: PurchaseView[];
  /** Cheapest current second-hand offer, if any. */
  bestOffer: { price: number; storeName: string; country: string } | undefined;
  /** Price used for one still-to-buy piece: best offer, else regular price. */
  estimateUnit: number | undefined;
  estimateSource: "tweedekans" | "nieuw" | undefined;
  paid: number;
  /** Paid so far plus the estimate for the remaining pieces. */
  lineTotal: number;
  watched: boolean;
};

export type ListView = {
  id: number;
  name: string;
  items: ListItemView[];
  totals: {
    pieces: number;
    bought: number;
    paid: number;
    toBuy: number;
    total: number;
    /** Total at regular prices (items with a known regular price only). */
    atNewPrice: number;
    saving: number;
  };
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function createList(
  db: DatabaseSync,
  userId: number,
  name: string,
  now: number,
): number {
  const res = db
    .prepare("INSERT INTO lists (user_id, name, created_at) VALUES (?, ?, ?)")
    .run(userId, name.trim().slice(0, 60) || "Nieuwe lijst", now);
  return Number(res.lastInsertRowid);
}

export function ownsList(
  db: DatabaseSync,
  userId: number,
  listId: number,
): boolean {
  return (
    db
      .prepare("SELECT 1 FROM lists WHERE id = ? AND user_id = ?")
      .get(listId, userId) !== undefined
  );
}

export function ownsItem(
  db: DatabaseSync,
  userId: number,
  itemId: number,
): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM list_items li JOIN lists l ON l.id = li.list_id
         WHERE li.id = ? AND l.user_id = ?`,
      )
      .get(itemId, userId) !== undefined
  );
}

export function ownsPurchase(
  db: DatabaseSync,
  userId: number,
  purchaseId: number,
): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM purchases p
         JOIN list_items li ON li.id = p.list_item_id
         JOIN lists l ON l.id = li.list_id
         WHERE p.id = ? AND l.user_id = ?`,
      )
      .get(purchaseId, userId) !== undefined
  );
}

export function renameList(db: DatabaseSync, id: number, name: string): void {
  db.prepare("UPDATE lists SET name = ? WHERE id = ?").run(
    name.trim().slice(0, 60) || "Lijst",
    id,
  );
}

export function deleteList(db: DatabaseSync, id: number): void {
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM purchases WHERE list_item_id IN (SELECT id FROM list_items WHERE list_id = ?)",
    ).run(id);
    db.prepare("DELETE FROM list_items WHERE list_id = ?").run(id);
    db.prepare("DELETE FROM lists WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function findListItem(
  db: DatabaseSync,
  listId: number,
  articleNumber: string,
): { id: number; quantity: number } | undefined {
  return db
    .prepare(
      "SELECT id, quantity FROM list_items WHERE list_id = ? AND article_number = ?",
    )
    .get(listId, articleNumber) as { id: number; quantity: number } | undefined;
}

/** Adds a product to a list; an existing item gets the larger quantity ("max") or is increased ("add"). */
export function addListItem(
  db: DatabaseSync,
  listId: number,
  product: ListProduct,
  quantity: number,
  mode: "max" | "add",
  now: number,
): "added" | "updated" | "unchanged" {
  const qty = Math.min(Math.max(Math.round(quantity), 1), 99);
  const existing = findListItem(db, listId, product.articleNumber);
  if (existing) {
    const next =
      mode === "add"
        ? Math.min(existing.quantity + qty, 99)
        : Math.max(existing.quantity, qty);
    if (next === existing.quantity) return "unchanged";
    db.prepare("UPDATE list_items SET quantity = ? WHERE id = ?").run(
      next,
      existing.id,
    );
    return "updated";
  }
  db.prepare(
    `INSERT INTO list_items (list_id, article_number, name, type_name, measure, image, url, normal_price, quantity, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    listId,
    product.articleNumber,
    product.name,
    product.typeName,
    product.measure,
    product.image ?? null,
    product.url ?? null,
    product.normalPrice ?? null,
    qty,
    now,
  );
  return "added";
}

export function setItemQuantity(
  db: DatabaseSync,
  itemId: number,
  quantity: number,
): void {
  db.prepare("UPDATE list_items SET quantity = ? WHERE id = ?").run(
    Math.min(Math.max(Math.round(quantity), 1), 99),
    itemId,
  );
}

export function removeListItem(db: DatabaseSync, itemId: number): void {
  db.prepare("DELETE FROM purchases WHERE list_item_id = ?").run(itemId);
  db.prepare("DELETE FROM list_items WHERE id = ?").run(itemId);
}

function remainingOf(db: DatabaseSync, itemId: number): number {
  const row = db
    .prepare(
      `SELECT li.quantity - COALESCE((SELECT SUM(p.quantity) FROM purchases p WHERE p.list_item_id = li.id), 0) AS remaining
       FROM list_items li WHERE li.id = ?`,
    )
    .get(itemId) as { remaining: number } | undefined;
  return Math.max(0, row?.remaining ?? 0);
}

/** Records bought pieces, one price per piece. Never more than what is still needed. Returns the count. */
export function recordPieces(
  db: DatabaseSync,
  itemId: number,
  unitPrices: (number | undefined)[],
  storeName: string | undefined,
  now: number,
): number {
  const room = remainingOf(db, itemId);
  const pieces = unitPrices.slice(0, room);
  const insert = db.prepare(
    "INSERT INTO purchases (list_item_id, quantity, unit_price, store_name, purchased_at) VALUES (?, 1, ?, ?, ?)",
  );
  const store = (storeName ?? "").trim().slice(0, 60);
  for (const price of pieces) {
    insert.run(
      itemId,
      price !== undefined && price >= 0 ? round2(price) : null,
      store === "" ? null : store,
      now,
    );
  }
  return pieces.length;
}

export function undoPurchase(db: DatabaseSync, purchaseId: number): void {
  db.prepare("DELETE FROM purchases WHERE id = ?").run(purchaseId);
}

/**
 * Ticks off pieces after a trip: first on list items (oldest list first) that still need them,
 * whatever is left goes to the manual quantity of the watchlist item.
 */
export function purchaseByArticle(
  db: DatabaseSync,
  userId: number,
  items: {
    articleNumber: string;
    count: number;
    unitPrice?: number | undefined;
    storeName?: string | undefined;
  }[],
  now: number,
): void {
  const rows = db.prepare(
    `SELECT li.id FROM list_items li JOIN lists l ON l.id = li.list_id
     WHERE l.user_id = ? AND li.article_number = ? ORDER BY li.list_id, li.id`,
  );
  for (const item of items) {
    let left = Math.round(item.count);
    for (const row of rows.all(userId, item.articleNumber) as {
      id: number;
    }[]) {
      if (left <= 0) break;
      const done = recordPieces(
        db,
        row.id,
        Array.from({ length: left }, () => item.unitPrice),
        item.storeName,
        now,
      );
      left -= done;
    }
    if (left > 0)
      markPurchased(db, userId, [
        { articleNumber: item.articleNumber, count: left },
      ]);
  }
}

export function setItemWatched(
  db: DatabaseSync,
  userId: number,
  itemId: number,
  watched: boolean,
  now: number,
): void {
  const item = db
    .prepare(
      "SELECT article_number, name, type_name, measure, image, url FROM list_items WHERE id = ?",
    )
    .get(itemId) as
    | {
        article_number: string;
        name: string;
        type_name: string;
        measure: string;
        image: string | null;
        url: string | null;
      }
    | undefined;
  if (!item) return;
  if (watched) {
    db.prepare(
      `INSERT OR IGNORE INTO watch_items (user_id, article_number, name, type_name, measure, image, url, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      item.article_number,
      item.name,
      item.type_name,
      item.measure,
      item.image,
      item.url,
      now,
    );
  } else {
    db.prepare(
      "DELETE FROM watch_items WHERE user_id = ? AND article_number = ?",
    ).run(userId, item.article_number);
  }
}

export function setListWatched(
  db: DatabaseSync,
  userId: number,
  listId: number,
  watched: boolean,
  now: number,
): void {
  const ids = db
    .prepare("SELECT id FROM list_items WHERE list_id = ?")
    .all(listId) as { id: number }[];
  for (const { id } of ids) setItemWatched(db, userId, id, watched, now);
}

type ItemRow = {
  id: number;
  list_id: number;
  article_number: string;
  name: string;
  type_name: string;
  measure: string;
  image: string | null;
  url: string | null;
  normal_price: number | null;
  quantity: number;
};

export function getLists(
  db: DatabaseSync,
  userId: number,
  countries: string[],
): ListView[] {
  const lists = db
    .prepare("SELECT id, name FROM lists WHERE user_id = ? ORDER BY id")
    .all(userId) as {
    id: number;
    name: string;
  }[];
  const items = db
    .prepare(
      `SELECT li.* FROM list_items li JOIN lists l ON l.id = li.list_id
       WHERE l.user_id = ? ORDER BY li.id`,
    )
    .all(userId) as ItemRow[];
  const purchases = db
    .prepare(
      `SELECT p.* FROM purchases p
       JOIN list_items li ON li.id = p.list_item_id
       JOIN lists l ON l.id = li.list_id
       WHERE l.user_id = ? ORDER BY p.id`,
    )
    .all(userId) as {
    id: number;
    list_item_id: number;
    quantity: number;
    unit_price: number | null;
    store_name: string | null;
    purchased_at: number;
  }[];
  const bestOffer = db.prepare(
    `SELECT o.price, s.name, s.country FROM offers o JOIN stores s ON s.store_id = o.store_id
     WHERE o.article_number = ? AND o.active = 1
       AND s.country IN (${countries.map(() => "?").join(",")})
     ORDER BY o.price ASC LIMIT 1`,
  );
  const originalPrice = db.prepare(
    "SELECT MAX(original_price) AS p FROM offers WHERE article_number = ? AND original_price IS NOT NULL",
  );
  const watched = new Set(
    (
      db
        .prepare("SELECT article_number FROM watch_items WHERE user_id = ?")
        .all(userId) as {
        article_number: string;
      }[]
    ).map((r) => r.article_number),
  );
  const cache = new Map<
    string,
    {
      best?: { price: number; name: string; country: string };
      original?: number;
    }
  >();
  const lookup = (article: string) => {
    let hit = cache.get(article);
    if (!hit) {
      const best = bestOffer.get(article, ...countries) as
        { price: number; name: string; country: string } | undefined;
      const original = (originalPrice.get(article) as { p: number | null }).p;
      hit = { ...(best ? { best } : {}), ...(original ? { original } : {}) };
      cache.set(article, hit);
    }
    return hit;
  };

  return lists.map((list): ListView => {
    const views = items
      .filter((i) => i.list_id === list.id)
      .map((i): ListItemView => {
        const mine = purchases
          .filter((p) => p.list_item_id === i.id)
          .map((p): PurchaseView => ({
            id: p.id,
            quantity: p.quantity,
            unitPrice: p.unit_price ?? undefined,
            storeName: p.store_name ?? undefined,
            purchasedAt: p.purchased_at,
          }));
        const { best, original } = lookup(i.article_number);
        const normalPrice = i.normal_price ?? original;
        const bought = mine.reduce((n, p) => n + p.quantity, 0);
        const remaining = Math.max(0, i.quantity - bought);
        const estimateUnit = best?.price ?? normalPrice;
        const paid = round2(
          mine.reduce(
            (n, p) => n + p.quantity * (p.unitPrice ?? estimateUnit ?? 0),
            0,
          ),
        );
        return {
          id: i.id,
          articleNumber: i.article_number,
          name: i.name,
          typeName: i.type_name,
          measure: i.measure,
          image: i.image ?? undefined,
          url: i.url ?? undefined,
          normalPrice,
          quantity: i.quantity,
          bought,
          remaining,
          purchases: mine,
          bestOffer: best
            ? { price: best.price, storeName: best.name, country: best.country }
            : undefined,
          estimateUnit,
          estimateSource: best
            ? "tweedekans"
            : normalPrice
              ? "nieuw"
              : undefined,
          paid,
          lineTotal: round2(paid + remaining * (estimateUnit ?? 0)),
          watched: watched.has(i.article_number),
        };
      });
    const paid = round2(views.reduce((n, v) => n + v.paid, 0));
    const total = round2(views.reduce((n, v) => n + v.lineTotal, 0));
    const known = views.filter((v) => v.normalPrice !== undefined);
    const atNewPrice = round2(
      known.reduce((n, v) => n + v.quantity * (v.normalPrice ?? 0), 0),
    );
    const knownTotal = round2(known.reduce((n, v) => n + v.lineTotal, 0));
    return {
      id: list.id,
      name: list.name,
      items: views,
      totals: {
        pieces: views.reduce((n, v) => n + v.quantity, 0),
        bought: views.reduce((n, v) => n + v.bought, 0),
        paid,
        toBuy: round2(total - paid),
        total,
        atNewPrice,
        saving: round2(atNewPrice - knownTotal),
      },
    };
  });
}
