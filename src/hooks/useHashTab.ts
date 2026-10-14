"use client";

import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
  };
};

const getHash = (): string => window.location.hash.slice(1);
const getServerHash = (): string => "";

/** Tab state kept in the URL hash, so tabs are linkable and survive reloads. */
export function useHashTab<T extends string>(
  tabs: readonly T[],
  fallback: T,
): T {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  return tabs.find((t) => t === hash) ?? fallback;
}
