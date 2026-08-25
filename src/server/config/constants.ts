/**
 * Values that must be resolvable without a validated environment — the Drizzle
 * schema and drizzle-kit both import from here, and drizzle-kit runs outside the
 * app runtime.
 *
 * EMBEDDING_DIMENSIONS is baked into the `vector(N)` column at migration-generate
 * time. If you switch embedding models you must change it here AND regenerate the
 * migration (or ALTER the column) — Postgres will reject vectors of another width.
 *
 *   nomic-embed-text      -> 768   (default)
 *   mxbai-embed-large     -> 1024
 *   all-minilm            -> 384
 */
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 768);

/** Media domains the platform understands. */
export const DOMAINS = ["MUSIC", "VIDEO"] as const;
export type DomainValue = (typeof DOMAINS)[number];

export const MEDIA_TYPES = ["TRACK", "MOVIE", "SERIES"] as const;
export type MediaTypeValue = (typeof MEDIA_TYPES)[number];

/** Identifier of the flagship monthly chart. */
export const TOP_50_CHART_ID = "top-50-pop";
