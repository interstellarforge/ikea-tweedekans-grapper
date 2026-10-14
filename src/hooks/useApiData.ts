"use client";

import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api-client.ts";

type State<T> = { data: T | undefined; error: string | undefined };

/** Loads JSON from our own API; `reload()` re-fetches without flashing an empty state. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is the caller-asserted response shape
export function useApiData<T>(path: string | undefined): {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<State<T>>({
    data: undefined,
    error: undefined,
  });
  const [loading, setLoading] = useState(path !== undefined);

  const reload = useCallback(async () => {
    if (path === undefined) return;
    try {
      const data = await api<T>(path);
      setState({ data, error: undefined });
    } catch (error) {
      setState((previous) => ({ ...previous, error: errorMessage(error) }));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, loading, reload };
}
