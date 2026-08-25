/**
 * Vector store operations against pgvector.
 *
 * Drizzle's query builder has no vector distance operator, so retrieval is
 * hand-written SQL through the same connection. Two independent retrievers run
 * here — cosine similarity and Postgres full-text — and the caller fuses them.
 */
import { sql, type SQL } from "drizzle-orm";

import type { Domain, MediaSummary, MediaType } from "@/lib/types";
import { db, executeRows } from "@/server/db";
import { vectorUnavailable } from "@/server/lib/errors";
import { logger, timed } from "@/server/lib/logger";
import { toVectorLiteral } from "@/server/vector/embeddings";

export interface RetrievalFilters {
  domain?: Domain;
  mediaTypes?: MediaType[];
  genres?: string[];
  moods?: string[];
  languages?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  maxRuntimeMinutes?: number | null;
  minRating?: number | null;
  minPopularity?: number | null;
  /** Audio-feature bounds, 0..1. Music only. */
  minEnergy?: number | null;
  maxEnergy?: number | null;
  familyFriendly?: boolean | null;
  excludeIds?: string[];
  includeIds?: string[];
  /** Genres/keywords to exclude entirely. */
  avoid?: string[];
}

export interface ScoredId {
  id: string;
  score: number;
}

const MEDIA_COLUMNS = sql`
  id, domain, media_type, title, subtitle, album, description, image_url, external_url,
  release_date, release_year, popularity, rating, vote_count, runtime_min, seasons, episodes,
  language, adult, genres, moods, themes, tags, energy, danceability, valence, acousticness,
  tempo, tone, pacing, intensity, source
`;

interface MediaRow {
  id: string;
  domain: Domain;
  media_type: MediaType;
  title: string;
  subtitle: string;
  album: string | null;
  description: string;
  image_url: string | null;
  external_url: string | null;
  release_date: string | Date | null;
  release_year: number | null;
  popularity: number | string;
  rating: number | string | null;
  vote_count: number | null;
  runtime_min: number | null;
  seasons: number | null;
  episodes: number | null;
  language: string;
  adult: boolean;
  genres: string[];
  moods: string[];
  themes: string[];
  tags: string[];
  energy: number | string | null;
  danceability: number | string | null;
  valence: number | string | null;
  acousticness: number | string | null;
  tempo: number | string | null;
  tone: string | null;
  pacing: string | null;
  intensity: string | null;
  source: string;
}

const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function mapMediaRow(row: MediaRow): MediaSummary {
  return {
    id: row.id,
    domain: row.domain,
    mediaType: row.media_type,
    title: row.title,
    subtitle: row.subtitle ?? "",
    album: row.album,
    description: row.description ?? "",
    imageUrl: row.image_url,
    externalUrl: row.external_url,
    releaseDate: row.release_date ? new Date(row.release_date).toISOString() : null,
    releaseYear: row.release_year,
    popularity: toNumber(row.popularity) ?? 0,
    rating: toNumber(row.rating),
    voteCount: row.vote_count,
    runtimeMin: row.runtime_min,
    seasons: row.seasons,
    episodes: row.episodes,
    language: row.language,
    adult: row.adult,
    genres: row.genres ?? [],
    moods: row.moods ?? [],
    themes: row.themes ?? [],
    tags: row.tags ?? [],
    energy: toNumber(row.energy),
    danceability: toNumber(row.danceability),
    valence: toNumber(row.valence),
    acousticness: toNumber(row.acousticness),
    tempo: toNumber(row.tempo),
    tone: row.tone,
    pacing: row.pacing,
    intensity: row.intensity,
    source: row.source,
  };
}

function textArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** Structured filters, applied in SQL so they narrow before ranking. */
export function buildFilterConditions(filters: RetrievalFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.domain) conditions.push(sql`domain = ${filters.domain}::domain`);

  if (filters.mediaTypes?.length) {
    conditions.push(
      sql`media_type = ANY(${sql.join(
        [sql`ARRAY[${sql.join(filters.mediaTypes.map((t) => sql`${t}`), sql`, `)}]::media_type[]`],
        sql``,
      )})`,
    );
  }

  const lower = (values: string[]) => values.map((value) => value.toLowerCase().trim()).filter(Boolean);

  if (filters.genres?.length) {
    const values = lower(filters.genres);
    if (values.length) {
      // Overlap on exact genre labels, or a substring match for broader terms
      // ("sci-fi" should reach "science fiction").
      conditions.push(
        sql`(genres && ${textArray(values)} OR EXISTS (
              SELECT 1 FROM unnest(genres) g
              WHERE ${sql.join(
                values.map((value) => sql`g ILIKE ${`%${value}%`}`),
                sql` OR `,
              )}
            ))`,
      );
    }
  }

  if (filters.moods?.length) {
    const values = lower(filters.moods);
    if (values.length) conditions.push(sql`(moods && ${textArray(values)} OR tags && ${textArray(values)})`);
  }

  if (filters.languages?.length) {
    conditions.push(sql`language = ANY(${textArray(lower(filters.languages))})`);
  }

  if (filters.yearFrom != null) conditions.push(sql`release_year >= ${filters.yearFrom}`);
  if (filters.yearTo != null) conditions.push(sql`release_year <= ${filters.yearTo}`);
  if (filters.maxRuntimeMinutes != null) {
    conditions.push(sql`(runtime_min IS NULL OR runtime_min <= ${filters.maxRuntimeMinutes})`);
  }
  if (filters.minRating != null) conditions.push(sql`(rating IS NULL OR rating >= ${filters.minRating})`);
  if (filters.minPopularity != null) conditions.push(sql`popularity >= ${filters.minPopularity}`);
  // Tracks with unknown energy stay eligible: Spotify restricted audio-features
  // for newer apps, and excluding them would empty the result set.
  if (filters.minEnergy != null) {
    conditions.push(sql`(energy IS NULL OR energy >= ${filters.minEnergy})`);
  }
  if (filters.maxEnergy != null) {
    conditions.push(sql`(energy IS NULL OR energy <= ${filters.maxEnergy})`);
  }
  if (filters.familyFriendly) {
    conditions.push(sql`adult = false AND (intensity IS NULL OR intensity NOT IN ('high', 'extreme'))`);
  }
  if (filters.excludeIds?.length) {
    conditions.push(sql`id <> ALL(${textArray(filters.excludeIds)})`);
  }
  if (filters.includeIds?.length) {
    conditions.push(sql`id = ANY(${textArray(filters.includeIds)})`);
  }
  if (filters.avoid?.length) {
    const values = lower(filters.avoid);
    if (values.length) {
      conditions.push(
        sql`NOT (genres && ${textArray(values)}) AND NOT (moods && ${textArray(values)})`,
      );
    }
  }

  return conditions;
}

function whereClause(conditions: SQL[]): SQL {
  if (conditions.length === 0) return sql`TRUE`;
  return sql.join(conditions, sql` AND `);
}

export interface VectorSearchParams {
  vector: number[];
  model: string;
  filters: RetrievalFilters;
  limit: number;
  minScore: number;
}

/** Cosine similarity over pgvector. Returns 1 - distance, so higher is better. */
export async function vectorSearch({
  vector,
  model,
  filters,
  limit,
  minScore,
}: VectorSearchParams): Promise<ScoredId[]> {
  if (vector.length === 0) return [];
  const literal = toVectorLiteral(vector);
  const conditions = [
    sql`embedding IS NOT NULL`,
    sql`embed_model = ${model}`,
    ...buildFilterConditions(filters),
  ];

  try {
    const rows = await timed("vector:search", () =>
      executeRows<{ id: string; score: number | string }>(sql`
        SELECT id, 1 - (embedding <=> ${literal}::vector) AS score
        FROM media_items
        WHERE ${whereClause(conditions)}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${limit}
      `),
    );
    const scored = rows.map((row) => ({ id: row.id, score: toNumber(row.score) ?? 0 }));
    const confident = scored.filter((row) => row.score >= minScore);
    /**
     * The threshold is a quality preference, not a hard gate. Absolute cosine
     * values shift with the embedding model — and drop sharply on the offline
     * fallback embedder — so enforcing it strictly would return almost nothing
     * in degraded mode. Keep the confident set when it is substantial, and
     * otherwise fall back to the ordered neighbours, which are still the
     * closest things in the catalogue.
     */
    return confident.length >= Math.max(3, Math.ceil(limit / 4)) ? confident : scored;
  } catch (error) {
    logger.error("vector search failed", { error });
    throw vectorUnavailable(error);
  }
}

export interface KeywordSearchParams {
  query: string;
  filters: RetrievalFilters;
  limit: number;
}

/**
 * Full-text retrieval over the enriched document, weighted so a title match
 * outranks a body match. Falls back to ILIKE if the text search configuration
 * is unavailable.
 */
export async function keywordSearch({
  query,
  filters,
  limit,
}: KeywordSearchParams): Promise<ScoredId[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const conditions = buildFilterConditions(filters);

  try {
    const rows = await timed("keyword:search", () =>
      executeRows<{ id: string; score: number | string }>(sql`
        SELECT id,
               ts_rank(
                 setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                 setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
                 setweight(to_tsvector('english', coalesce(document, '')), 'C'),
                 websearch_to_tsquery('english', ${trimmed})
               ) AS score
        FROM media_items
        WHERE ${whereClause(conditions)}
          AND (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(document, '')), 'C')
          ) @@ websearch_to_tsquery('english', ${trimmed})
        ORDER BY score DESC
        LIMIT ${limit}
      `),
    );
    return rows.map((row) => ({ id: row.id, score: toNumber(row.score) ?? 0 }));
  } catch (error) {
    logger.warn("full-text search unavailable; falling back to ILIKE", {
      error: error instanceof Error ? error.message : String(error),
    });
    return ilikeSearch(trimmed, conditions, limit);
  }
}

async function ilikeSearch(query: string, conditions: SQL[], limit: number): Promise<ScoredId[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .slice(0, 8);
  if (terms.length === 0) return [];

  const scoreExpr = sql.join(
    terms.map(
      (term) =>
        sql`(CASE WHEN title ILIKE ${`%${term}%`} THEN 3 WHEN subtitle ILIKE ${`%${term}%`} THEN 2 WHEN document ILIKE ${`%${term}%`} THEN 1 ELSE 0 END)`,
    ),
    sql` + `,
  );

  const rows = await executeRows<{ id: string; score: number | string }>(sql`
    SELECT id, (${scoreExpr})::float / ${terms.length * 3} AS score
    FROM media_items
    WHERE ${whereClause(conditions)}
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ id: row.id, score: toNumber(row.score) ?? 0 })).filter((r) => r.score > 0);
}

/** Popularity-ordered fallback when neither retriever produces anything. */
export async function popularityFallback(
  filters: RetrievalFilters,
  limit: number,
): Promise<ScoredId[]> {
  const conditions = buildFilterConditions(filters);
  const rows = await executeRows<{ id: string; popularity: number | string }>(sql`
    SELECT id, popularity
    FROM media_items
    WHERE ${whereClause(conditions)}
    ORDER BY popularity DESC NULLS LAST
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ id: row.id, score: (toNumber(row.popularity) ?? 0) / 100 }));
}

export async function fetchMediaByIds(ids: string[]): Promise<Map<string, MediaSummary>> {
  if (ids.length === 0) return new Map();
  const rows = await executeRows<MediaRow>(sql`
    SELECT ${MEDIA_COLUMNS} FROM media_items WHERE id = ANY(${textArray(ids)})
  `);
  return new Map(rows.map((row) => [row.id, mapMediaRow(row)]));
}

export async function fetchMediaById(id: string): Promise<MediaSummary | null> {
  const found = await fetchMediaByIds([id]);
  return found.get(id) ?? null;
}

export async function listMedia(
  filters: RetrievalFilters,
  limit: number,
  orderBy: "popularity" | "recent" = "popularity",
): Promise<MediaSummary[]> {
  const conditions = buildFilterConditions(filters);
  const order =
    orderBy === "recent"
      ? sql`release_date DESC NULLS LAST, popularity DESC`
      : sql`popularity DESC NULLS LAST`;
  const rows = await executeRows<MediaRow>(sql`
    SELECT ${MEDIA_COLUMNS} FROM media_items
    WHERE ${whereClause(conditions)}
    ORDER BY ${order}
    LIMIT ${limit}
  `);
  return rows.map(mapMediaRow);
}

/** Free-text title lookup used to resolve "similar to <title>" references. */
export async function findByTitle(
  title: string,
  domain?: Domain,
): Promise<MediaSummary | null> {
  const conditions: SQL[] = [sql`title ILIKE ${title}`];
  if (domain) conditions.push(sql`domain = ${domain}::domain`);
  const exact = await executeRows<MediaRow>(sql`
    SELECT ${MEDIA_COLUMNS} FROM media_items
    WHERE ${whereClause(conditions)}
    ORDER BY popularity DESC LIMIT 1
  `);
  if (exact.length) return mapMediaRow(exact[0]);

  const fuzzyConditions: SQL[] = [sql`title ILIKE ${`%${title}%`}`];
  if (domain) fuzzyConditions.push(sql`domain = ${domain}::domain`);
  const fuzzy = await executeRows<MediaRow>(sql`
    SELECT ${MEDIA_COLUMNS} FROM media_items
    WHERE ${whereClause(fuzzyConditions)}
    ORDER BY popularity DESC LIMIT 1
  `);
  return fuzzy.length ? mapMediaRow(fuzzy[0]) : null;
}

/**
 * Resolve an artist reference ("similar to Dua Lipa").
 *
 * In music, "like X" almost always names an artist rather than a track, so a
 * title lookup alone silently fails on the most common phrasing. This builds a
 * profile from everything that artist has in the catalogue — their genres,
 * moods and themes — and returns their track ids so the caller can steer
 * towards the sound without simply handing back the same artist.
 */
export async function findArtistProfile(artist: string): Promise<{
  artist: string;
  ids: string[];
  genres: string[];
  moods: string[];
  themes: string[];
} | null> {
  const term = artist.trim();
  if (term.length < 2) return null;

  const rows = await executeRows<{
    id: string;
    subtitle: string;
    genres: string[];
    moods: string[];
    themes: string[];
  }>(sql`
    SELECT id, subtitle, genres, moods, themes
    FROM media_items
    WHERE domain = 'MUSIC' AND (subtitle ILIKE ${term} OR subtitle ILIKE ${`%${term}%`})
    ORDER BY popularity DESC
    LIMIT 30
  `);
  if (rows.length === 0) return null;

  const tally = (values: string[][]) => {
    const counts = new Map<string, number>();
    for (const list of values) {
      for (const value of list ?? []) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value]) => value);
  };

  return {
    artist: rows[0].subtitle,
    ids: rows.map((row) => row.id),
    genres: tally(rows.map((row) => row.genres)),
    moods: tally(rows.map((row) => row.moods)),
    themes: tally(rows.map((row) => row.themes)),
  };
}

export interface EmbeddingUpdate {
  id: string;
  vector: number[];
  model: string;
}

/** Write embeddings back. Batched to keep statements a sane size. */
export async function saveEmbeddings(updates: EmbeddingUpdate[]): Promise<number> {
  let written = 0;
  for (const update of updates) {
    await db.execute(sql`
      UPDATE media_items
      SET embedding = ${toVectorLiteral(update.vector)}::vector,
          embed_model = ${update.model},
          embedded_at = now()
      WHERE id = ${update.id}
    `);
    written += 1;
  }
  return written;
}

/** Items whose document changed (or that were never embedded) for this model. */
export async function findStaleEmbeddings(
  model: string,
  limit: number,
): Promise<Array<{ id: string; document: string }>> {
  return executeRows<{ id: string; document: string }>(sql`
    SELECT id, document
    FROM media_items
    WHERE document <> ''
      AND (embedding IS NULL OR embed_model IS DISTINCT FROM ${model})
    ORDER BY popularity DESC
    LIMIT ${limit}
  `);
}

export async function embeddingCoverage(model: string): Promise<{
  total: number;
  embedded: number;
  model: string;
}> {
  const rows = await executeRows<{ total: number | string; embedded: number | string }>(sql`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE embedding IS NOT NULL AND embed_model = ${model}) AS embedded
    FROM media_items
  `);
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    embedded: Number(row?.embedded ?? 0),
    model,
  };
}
