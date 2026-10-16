import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client.ts";
import type {
  AlertPage,
  ShoppingList,
  TripsResponse,
  WatchItem,
} from "./types.ts";

export const useWatchlist = () =>
  useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<WatchItem[]>("/api/watchlist"),
  });

export const useLists = () =>
  useQuery({
    queryKey: ["lists"],
    queryFn: () => api<ShoppingList[]>("/api/lists"),
  });

export const useAlerts = () =>
  useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<AlertPage>("/api/alerts?limit=100"),
  });

export const useTrips = () =>
  useQuery({
    queryKey: ["trips"],
    queryFn: () => api<TripsResponse>("/api/trips"),
  });

/** Refreshes everything that depends on lists, purchases and the watchlist. */
export function useInvalidateLists(): () => Promise<void> {
  const client = useQueryClient();
  return async () => {
    await Promise.all(
      ["watchlist", "lists", "trips", "alerts"].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
}
