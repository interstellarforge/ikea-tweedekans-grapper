import type { DatabaseSync } from "node:sqlite";

import {
  articleInsights,
  isFollowed,
  listStores,
  recordSyncError,
  syncStoreOffers,
  upsertStores,
} from "./db.ts";
import { fetchStoreOffers, fetchStores } from "./ikea-client.ts";
import { notifyAlert } from "./notify.ts";
import { getSettings } from "./settings.ts";
import { isWatched, recordAlert } from "./watchlist.ts";

export type PollStatus = {
  running: boolean;
  startedAt: number | undefined;
  finishedAt: number | undefined;
};

export const pollStatus: PollStatus = {
  running: false,
  startedAt: undefined,
  finishedAt: undefined,
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Fetches all offers of one store; raises alerts for watched articles in followed stores. */
export async function pollStore(
  db: DatabaseSync,
  storeId: string,
): Promise<number> {
  try {
    const offers = await fetchStoreOffers(storeId);
    const now = Date.now();
    const added = syncStoreOffers(db, storeId, offers, now);
    if (!isFollowed(db, storeId)) return added.length;
    const storeName =
      listStores(db).find((s) => s.storeId === storeId)?.name ?? storeId;
    for (const o of added) {
      if (!o.articleNumber || !isWatched(db, o.articleNumber)) continue;
      const alert = {
        storeId,
        offerNumber: o.offerNumber,
        articleNumber: o.articleNumber,
        title: o.title,
        description: o.description,
        price: o.price,
        storeName,
        createdAt: now,
        seen: false,
      };
      if (!recordAlert(db, alert)) continue;
      const tag = articleInsights(db, [o.articleNumber])[
        o.articleNumber
      ]?.offers.find(
        (x) => x.offerNumber === o.offerNumber && x.storeId === storeId,
      )?.tag;
      void notifyAlert(db, alert, tag);
    }
    return added.length;
  } catch (error) {
    recordSyncError(db, storeId, errorMessage(error));
    throw error;
  }
}

/** Syncs every store of the configured country. No-op when already running. */
export async function pollAll(db: DatabaseSync): Promise<void> {
  if (pollStatus.running) return;
  pollStatus.running = true;
  pollStatus.startedAt = Date.now();
  try {
    try {
      upsertStores(db, await fetchStores());
    } catch (error) {
      console.error("[poll] store list failed:", errorMessage(error));
    }
    for (const store of listStores(db)) {
      try {
        const added = await pollStore(db, store.storeId);
        console.log(`[poll] ${store.name}: ${String(added)} new`);
      } catch (error) {
        console.error(`[poll] ${store.name} failed:`, errorMessage(error));
      }
    }
  } finally {
    pollStatus.running = false;
    pollStatus.finishedAt = Date.now();
  }
}

/** Runs pollAll repeatedly; the interval is re-read from settings after each run. */
export function startPolling(db: DatabaseSync): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const loop = () => {
    void pollAll(db).finally(() => {
      if (stopped) return;
      timer = setTimeout(loop, getSettings(db).pollIntervalMin * 60_000);
    });
  };
  loop();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
