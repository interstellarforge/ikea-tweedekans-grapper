import type { DatabaseSync } from "node:sqlite";

import { COUNTRIES, isCountry } from "./countries.ts";
import {
  articleInsights,
  isFollowed,
  listStores,
  recordSyncError,
  syncStoreOffers,
  upsertStores,
} from "./db.ts";
import { fetchStoreOffers, fetchStores } from "./ikea-client.ts";
import { notifyAlert, tagText } from "./notify.ts";
import { getSettings } from "./settings.ts";
import { isWatched, recordAlert, setAlertDelivery } from "./watchlist.ts";

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
    const store = listStores(db, { includeDisabled: true }).find(
      (st) => st.storeId === storeId,
    );
    const country = store?.country ?? "nl";
    const language = isCountry(country) ? COUNTRIES[country].apiLanguage : "nl";
    const offers = await fetchStoreOffers(storeId, language);
    const now = Date.now();
    const added = syncStoreOffers(db, storeId, offers, now);
    if (!isFollowed(db, storeId)) return added.length;
    const storeName = store?.name ?? storeId;
    for (const o of added) {
      if (!o.articleNumber || !isWatched(db, o.articleNumber)) continue;
      const tag = articleInsights(db, [o.articleNumber])[
        o.articleNumber
      ]?.offers.find(
        (x) => x.offerNumber === o.offerNumber && x.storeId === storeId,
      )?.tag;
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
        country,
        note: tagText(tag),
        delivery: "",
      };
      if (!recordAlert(db, alert)) continue;
      void notifyAlert(db, alert).then((delivery) => {
        setAlertDelivery(db, storeId, o.offerNumber, delivery);
      });
    }
    return added.length;
  } catch (error) {
    recordSyncError(db, storeId, errorMessage(error));
    throw error;
  }
}

const runState = { rerunRequested: false };
const rerunWasRequested = (): boolean => runState.rerunRequested;

async function pollOnce(db: DatabaseSync): Promise<void> {
  for (const country of getSettings(db).countries) {
    try {
      upsertStores(db, await fetchStores(country), country);
    } catch (error) {
      console.error(
        `[poll] store list (${country}) failed:`,
        errorMessage(error),
      );
    }
  }
  for (const store of listStores(db)) {
    try {
      const added = await pollStore(db, store.storeId);
      console.log(`[poll] ${store.name}: ${String(added)} new`);
    } catch (error) {
      console.error(`[poll] ${store.name} failed:`, errorMessage(error));
    }
  }
}

/**
 * Syncs every store of the enabled countries. When a run is already in progress this schedules
 * one more run right after it (settings such as the enabled countries may have changed).
 */
export async function pollAll(db: DatabaseSync): Promise<void> {
  if (pollStatus.running) {
    runState.rerunRequested = true;
    return;
  }
  pollStatus.running = true;
  pollStatus.startedAt = Date.now();
  try {
    let again = true;
    while (again) {
      runState.rerunRequested = false;
      await pollOnce(db);
      again = rerunWasRequested();
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
