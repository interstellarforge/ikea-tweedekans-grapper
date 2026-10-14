"use client";

import { useEffect, useState } from "react";

const DEFAULT_DELAY_MS = 350;

export function useDebouncedValue<T>(value: T, delay = DEFAULT_DELAY_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}
