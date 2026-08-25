"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import type { DiscoveryResponse, SearchHistoryDto } from "@/lib/types";

/**
 * Generic loader with the states a UI actually needs to render: loading, error,
 * data, and a reload that doesn't blank the screen. Requests are aborted when
 * the component unmounts or the key changes, so a slow response can't overwrite
 * a newer one.
 */
export function useResource<T>(
  path: string | null,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .get<T>(path, controller.signal)
      .then((result) => setData(result))
      .catch((requestError) => {
        if ((requestError as Error).name === "AbortError") return;
        setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}

export interface DiscoveryState {
  query: string;
  setQuery: (value: string) => void;
  result: DiscoveryResponse | null;
  loading: boolean;
  error: string | null;
  run: (query: string, extra?: Record<string, unknown>) => Promise<void>;
  reset: () => void;
}

/**
 * Drives a search page. Only the newest request is allowed to set state, so
 * typing a second query while the first is still running can't produce stale
 * results.
 */
export function useDiscovery(endpoint: string, initialQuery = ""): DiscoveryState {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const run = useCallback(
    async (nextQuery: string, extra?: Record<string, unknown>) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setQuery(trimmed);
      setLoading(true);
      setError(null);

      try {
        const data = await api.post<DiscoveryResponse>(
          endpoint,
          { query: trimmed, ...extra },
          controller.signal,
        );
        if (!controller.signal.aborted) setResult(data);
      } catch (requestError) {
        if ((requestError as Error).name === "AbortError") return;
        setError(errorMessage(requestError));
        setResult(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [endpoint],
  );

  const reset = useCallback(() => {
    inFlight.current?.abort();
    setQuery("");
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { query, setQuery, result, loading, error, run, reset };
}

/** Recent searches for the signed-in user, with a clear-all. */
export function useRecentSearches(enabled: boolean) {
  const [queries, setQueries] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!enabled) {
      setQueries([]);
      return;
    }
    try {
      const data = await api.get<{ history: SearchHistoryDto[] }>("/api/history?limit=12");
      setQueries([...new Set(data.history.map((entry) => entry.query))].slice(0, 6));
    } catch {
      setQueries([]);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = useCallback(async () => {
    setQueries([]);
    try {
      await api.del("/api/history");
    } catch {
      void load();
    }
  }, [load]);

  return { queries, refresh: load, clear };
}

/** Debounce a fast-changing value (search-as-you-type filters). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
