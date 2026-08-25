/**
 * Catalogue service — the write side of the media cache.
 *
 * Everything that enters the catalogue passes through here, so enrichment and
 * content hashing happen in exactly one place. The hash is what makes
 * re-ingestion cheap: an unchanged document keeps its embedding, a changed one
 * drops it and gets picked up by the embedding backfill.
 */
import { sql } from "drizzle-orm";

import { db, executeRows } from "@/server/db";
import { mediaItems } from "@/server/db/schema";
import { getEnv } from "@/server/config/env";
import { logger, timed } from "@/server/lib/logger";
import { enrich, hashDocument } from "@/server/media/enrich";
import type { MediaRecord } from "@/server/media/types";
import { activeEmbeddingModel, embedTexts } from "@/server/vector/embeddings";
import { findStaleEmbeddings, saveEmbeddings } from "@/server/vector/store";

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
  ids: string[];
}

/** Enrich and upsert records. Returns which ids are new or changed. */
export async function upsertRecords(records: MediaRecord[]): Promise<UpsertResult> {
  if (records.length === 0) return { inserted: 0, updated: 0, unchanged: 0, ids: [] };
  const { model } = await activeEmbeddingModel();

  const existing = await executeRows<{ id: string; content_hash: string }>(sql`
    SELECT id, content_hash FROM media_items
    WHERE id = ANY(ARRAY[${sql.join(records.map((r) => sql`${r.id}`), sql`, `)}]::text[])
  `);
  const existingHashes = new Map(existing.map((row) => [row.id, row.content_hash]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const changedIds: string[] = [];

  const rows = records.map((record) => {
    const enriched = enrich(record);
    const contentHash = hashDocument(enriched.document, model);
    const previous = existingHashes.get(record.id);
    if (previous === undefined) {
      inserted += 1;
      changedIds.push(record.id);
    } else if (previous !== contentHash) {
      updated += 1;
      changedIds.push(record.id);
    } else {
      unchanged += 1;
    }

    return {
      id: enriched.id,
      domain: enriched.domain,
      mediaType: enriched.mediaType,
      title: enriched.title,
      subtitle: enriched.subtitle ?? "",
      album: enriched.album ?? null,
      description: enriched.description ?? "",
      imageUrl: enriched.imageUrl ?? null,
      externalUrl: enriched.externalUrl ?? null,
      releaseDate: enriched.releaseDate ?? null,
      releaseYear: enriched.releaseYear ?? null,
      popularity: enriched.popularity ?? 0,
      rating: enriched.rating ?? null,
      voteCount: enriched.voteCount ?? null,
      runtimeMin: enriched.runtimeMin ?? null,
      seasons: enriched.seasons ?? null,
      episodes: enriched.episodes ?? null,
      language: enriched.language ?? "en",
      adult: enriched.adult ?? false,
      genres: enriched.genres ?? [],
      moods: enriched.moods ?? [],
      themes: enriched.themes ?? [],
      tags: enriched.tags ?? [],
      energy: enriched.energy ?? null,
      danceability: enriched.danceability ?? null,
      valence: enriched.valence ?? null,
      acousticness: enriched.acousticness ?? null,
      tempo: enriched.tempo ?? null,
      tone: enriched.tone ?? null,
      pacing: enriched.pacing ?? null,
      intensity: enriched.intensity ?? null,
      document: enriched.document,
      contentHash,
      source: enriched.source,
      raw: (enriched.raw ?? null) as Record<string, unknown> | null,
      updatedAt: new Date(),
    };
  });

  // Chunked so a big ingest doesn't build one enormous statement.
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await db
      .insert(mediaItems)
      .values(batch)
      .onConflictDoUpdate({
        target: mediaItems.id,
        set: {
          title: sql`excluded.title`,
          subtitle: sql`excluded.subtitle`,
          album: sql`excluded.album`,
          description: sql`excluded.description`,
          imageUrl: sql`excluded.image_url`,
          externalUrl: sql`excluded.external_url`,
          releaseDate: sql`excluded.release_date`,
          releaseYear: sql`excluded.release_year`,
          popularity: sql`excluded.popularity`,
          rating: sql`excluded.rating`,
          voteCount: sql`excluded.vote_count`,
          runtimeMin: sql`excluded.runtime_min`,
          seasons: sql`excluded.seasons`,
          episodes: sql`excluded.episodes`,
          language: sql`excluded.language`,
          adult: sql`excluded.adult`,
          genres: sql`excluded.genres`,
          moods: sql`excluded.moods`,
          themes: sql`excluded.themes`,
          tags: sql`excluded.tags`,
          energy: sql`excluded.energy`,
          danceability: sql`excluded.danceability`,
          valence: sql`excluded.valence`,
          acousticness: sql`excluded.acousticness`,
          tempo: sql`excluded.tempo`,
          tone: sql`excluded.tone`,
          pacing: sql`excluded.pacing`,
          intensity: sql`excluded.intensity`,
          document: sql`excluded.document`,
          contentHash: sql`excluded.content_hash`,
          source: sql`excluded.source`,
          raw: sql`excluded.raw`,
          updatedAt: sql`now()`,
          // Keep the embedding only while the document is byte-identical.
          embedding: sql`CASE WHEN media_items.content_hash = excluded.content_hash THEN media_items.embedding ELSE NULL END`,
          embedModel: sql`CASE WHEN media_items.content_hash = excluded.content_hash THEN media_items.embed_model ELSE NULL END`,
          embeddedAt: sql`CASE WHEN media_items.content_hash = excluded.content_hash THEN media_items.embedded_at ELSE NULL END`,
        },
      });
  }

  logger.info("catalogue upsert", { inserted, updated, unchanged, total: records.length });
  return { inserted, updated, unchanged, ids: changedIds };
}

export interface EmbeddingRunResult {
  processed: number;
  remaining: number;
  model: string;
  degraded: boolean;
}

/**
 * Generate embeddings for anything stale under the currently active model.
 * Batched, and safe to run repeatedly — it is a no-op once coverage is full.
 */
export async function generateMissingEmbeddings(max = 500, batchSize = 32): Promise<EmbeddingRunResult> {
  const { model, degraded } = await activeEmbeddingModel();
  let processed = 0;

  while (processed < max) {
    const pending = await findStaleEmbeddings(model, Math.min(batchSize, max - processed));
    if (pending.length === 0) break;

    const { vectors, model: usedModel } = await timed("embeddings:batch", () =>
      embedTexts(pending.map((item) => item.document)),
    );
    if (vectors.length !== pending.length) {
      logger.error("embedding batch size mismatch; aborting run", {
        expected: pending.length,
        received: vectors.length,
      });
      break;
    }

    await saveEmbeddings(
      pending.map((item, index) => ({ id: item.id, vector: vectors[index], model: usedModel })),
    );
    processed += pending.length;
  }

  const remaining = (await findStaleEmbeddings(model, 1)).length;
  return { processed, remaining, model, degraded };
}

/** Ensure specific ids are embedded — used after an on-demand live fetch. */
export async function ensureEmbedded(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { model } = await activeEmbeddingModel();
  const pending = await executeRows<{ id: string; document: string }>(sql`
    SELECT id, document FROM media_items
    WHERE id = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::text[])
      AND document <> ''
      AND (embedding IS NULL OR embed_model IS DISTINCT FROM ${model})
  `);
  if (pending.length === 0) return 0;

  const { vectors, model: usedModel } = await embedTexts(pending.map((item) => item.document));
  if (vectors.length !== pending.length) return 0;
  return saveEmbeddings(
    pending.map((item, index) => ({ id: item.id, vector: vectors[index], model: usedModel })),
  );
}

export async function catalogueStats(): Promise<{
  total: number;
  music: number;
  video: number;
  embedded: number;
  sources: Record<string, number>;
}> {
  const { model } = await activeEmbeddingModel();
  const rows = await executeRows<{
    total: number | string;
    music: number | string;
    video: number | string;
    embedded: number | string;
  }>(sql`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE domain = 'MUSIC') AS music,
           count(*) FILTER (WHERE domain = 'VIDEO') AS video,
           count(*) FILTER (WHERE embedding IS NOT NULL AND embed_model = ${model}) AS embedded
    FROM media_items
  `);
  const sourceRows = await executeRows<{ source: string; count: number | string }>(sql`
    SELECT source, count(*) AS count FROM media_items GROUP BY source
  `);
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    music: Number(row?.music ?? 0),
    video: Number(row?.video ?? 0),
    embedded: Number(row?.embedded ?? 0),
    sources: Object.fromEntries(sourceRows.map((r) => [r.source, Number(r.count)])),
  };
}

export function catalogueLimits() {
  const env = getEnv();
  return { resultLimit: env.RESULT_LIMIT, rerankCandidates: env.RERANK_CANDIDATES };
}
