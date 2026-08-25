/**
 * Hybrid retrieval.
 *
 * Three independent signals are fused into one ranking:
 *
 *   vector      — cosine similarity between the query embedding and the
 *                 enriched document embedding. Carries meaning.
 *   keyword     — Postgres full-text rank. Carries precision on names,
 *                 artists and exact phrases the embedding blurs away.
 *   popularity  — a mild prior so ties break towards things people watch.
 *
 * plus an optional personalisation term derived from the signed-in user's
 * learned affinities. Weights are configurable; scores from each retriever are
 * min-max normalised first so one signal's scale can't dominate another's.
 */
import type { ScoredMedia } from "@/lib/types";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/lib/logger";
import { embedQuery } from "@/server/vector/embeddings";
import {
  fetchMediaByIds,
  keywordSearch,
  popularityFallback,
  vectorSearch,
  type RetrievalFilters,
  type ScoredId,
} from "@/server/vector/store";

export interface RetrieveParams {
  /** Descriptive phrase to embed. */
  semanticQuery: string;
  /** Literal terms for full-text — names, titles, artists. */
  keywordQuery?: string;
  filters: RetrievalFilters;
  limit: number;
  /** Learned affinity scores, e.g. { "video:genre:science fiction": 3.2 }. */
  affinity?: Record<string, number>;
  /** Skip the popularity prior (used for "surprise me" style requests). */
  ignorePopularity?: boolean;
  /**
   * Traits of whatever the request referenced ("like Interstellar", "like Dua
   * Lipa"). Overlap with these is scored directly, which keeps similarity
   * queries sensible even when the embedding model is unavailable and the
   * fallback embedder can only see lexical overlap.
   */
  referenceProfile?: { genres: string[]; moods: string[]; themes: string[] };
}

export interface RetrieveResult {
  candidates: ScoredMedia[];
  degraded: boolean;
  notices: string[];
  timings: Record<string, number>;
  counts: { vector: number; keyword: number; fallback: number };
}

function normalise(scores: ScoredId[]): Map<string, number> {
  if (scores.length === 0) return new Map();
  const values = scores.map((s) => s.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return new Map(
    scores.map((s) => [s.id, span === 0 ? (max > 0 ? 1 : 0) : (s.score - min) / span]),
  );
}

/**
 * Trait overlap between a candidate and whatever the request referenced.
 *
 * Providers list a title's primary genre first, so position carries real
 * information: matching Interstellar on "science fiction" should count for far
 * more than matching it on "drama", which half the catalogue shares. Weights
 * therefore decay with position, and the score is the matched weight as a
 * fraction of the total available weight.
 */
export function referenceOverlap(
  media: { genres: string[]; moods: string[]; themes: string[] },
  profile: RetrieveParams["referenceProfile"],
): number {
  if (!profile) return 0;

  const weighted = (candidate: string[], wanted: string[], facetWeight: number) => {
    if (wanted.length === 0 || candidate.length === 0) return 0;

    // Highest weight wins when a trait appears in several references.
    const weights = new Map<string, number>();
    wanted.forEach((value, index) => {
      const key = value.toLowerCase();
      const weight = 1 / (1 + index % 6);
      weights.set(key, Math.max(weights.get(key) ?? 0, weight));
    });

    let total = 0;
    for (const weight of weights.values()) total += weight;
    if (total === 0) return 0;

    let matched = 0;
    for (const value of new Set(candidate.map((item) => item.toLowerCase()))) {
      matched += weights.get(value) ?? 0;
    }
    return (matched / total) * facetWeight;
  };

  return Math.min(
    1,
    weighted(media.genres, profile.genres, 0.6) +
      weighted(media.moods, profile.moods, 0.25) +
      weighted(media.themes, profile.themes, 0.15),
  );
}

/** Affinity keys look like "music:genre:pop"; score a candidate against them. */
export function affinityScore(
  media: { domain: string; genres: string[]; moods: string[]; themes: string[] },
  affinity: Record<string, number> | undefined,
): number {
  if (!affinity) return 0;
  const domain = media.domain.toLowerCase();
  let total = 0;
  let matches = 0;
  const consider = (kind: string, values: string[]) => {
    for (const value of values) {
      const score = affinity[`${domain}:${kind}:${value.toLowerCase()}`];
      if (typeof score === "number" && score > 0) {
        total += score;
        matches += 1;
      }
    }
  };
  consider("genre", media.genres);
  consider("mood", media.moods);
  consider("theme", media.themes);
  if (matches === 0) return 0;
  // Saturating: a lot of small affinities shouldn't outweigh actual relevance.
  return Math.min(1, total / (total + 4));
}

export async function retrieve(params: RetrieveParams): Promise<RetrieveResult> {
  const env = getEnv();
  const notices: string[] = [];
  const timings: Record<string, number> = {};
  const topK = Math.max(params.limit * 3, env.VECTOR_TOP_K);

  // --- vector ---------------------------------------------------------------
  let vectorHits: ScoredId[] = [];
  let degraded = false;
  const embedStart = Date.now();
  try {
    const { vector, model, degraded: embedDegraded } = await embedQuery(params.semanticQuery);
    degraded = embedDegraded;
    timings.embedding = Date.now() - embedStart;
    const vectorStart = Date.now();
    vectorHits = await vectorSearch({
      vector,
      model,
      filters: params.filters,
      limit: topK,
      minScore: env.VECTOR_MIN_SCORE,
    });
    timings.vector = Date.now() - vectorStart;
    if (embedDegraded) {
      notices.push(
        "Semantic matching is running on the offline fallback embedder. Start Ollama for full quality.",
      );
    }
    if (vectorHits.length === 0) {
      notices.push("No strong semantic matches; leaning on keyword and popularity signals.");
    }
  } catch (error) {
    degraded = true;
    timings.vector = Date.now() - embedStart;
    notices.push("Semantic search is unavailable, showing keyword matches instead.");
    logger.warn("vector stage failed; continuing with keyword retrieval", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // --- keyword --------------------------------------------------------------
  const keywordStart = Date.now();
  const keywordQuery = (params.keywordQuery ?? params.semanticQuery).trim();
  let keywordHits: ScoredId[] = [];
  try {
    keywordHits = await keywordSearch({
      query: keywordQuery,
      filters: params.filters,
      limit: topK,
    });
  } catch (error) {
    logger.warn("keyword stage failed", { error });
  }
  timings.keyword = Date.now() - keywordStart;

  // --- fallback -------------------------------------------------------------
  let fallbackHits: ScoredId[] = [];
  if (vectorHits.length === 0 && keywordHits.length === 0) {
    fallbackHits = await popularityFallback(params.filters, params.limit);
    if (fallbackHits.length > 0) {
      notices.push("Nothing matched precisely, so these are the closest popular options.");
    }
  }

  const vectorScores = normalise(vectorHits);
  const keywordScores = normalise(keywordHits);
  const ids = [
    ...new Set([
      ...vectorHits.map((h) => h.id),
      ...keywordHits.map((h) => h.id),
      ...fallbackHits.map((h) => h.id),
    ]),
  ];
  if (ids.length === 0) {
    return {
      candidates: [],
      degraded,
      notices,
      timings,
      counts: { vector: 0, keyword: 0, fallback: 0 },
    };
  }

  const media = await fetchMediaByIds(ids);
  const vectorWeight = env.HYBRID_VECTOR_WEIGHT;
  const keywordWeight = env.HYBRID_KEYWORD_WEIGHT;
  const popularityWeight = params.ignorePopularity ? 0 : env.HYBRID_POPULARITY_WEIGHT;

  const candidates: ScoredMedia[] = [];
  for (const id of ids) {
    const item = media.get(id);
    if (!item) continue;
    const vectorScore = vectorScores.get(id) ?? 0;
    const keywordScore = keywordScores.get(id) ?? 0;
    const popularityScore = (item.popularity ?? 0) / 100;
    const affinity = affinityScore(item, params.affinity);
    const reference = referenceOverlap(item, params.referenceProfile);

    const matchedOn: string[] = [];
    if (vectorScore > 0.15) matchedOn.push("semantic similarity");
    if (keywordScore > 0.1) matchedOn.push("keyword match");
    if (reference > 0.1) matchedOn.push("shared traits with your reference");
    if (params.filters.genres?.length) matchedOn.push("genre filter");
    if (affinity > 0.05) matchedOn.push("your saved taste");
    if (vectorScore === 0 && keywordScore === 0 && reference === 0) matchedOn.push("popularity");

    const score =
      vectorScore * vectorWeight +
      keywordScore * keywordWeight +
      popularityScore * popularityWeight +
      reference * 0.35 +
      affinity * 0.12;

    candidates.push({
      ...item,
      score,
      vectorScore,
      keywordScore,
      popularityScore,
      affinityScore: affinity,
      matchedOn,
      reason: null,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    candidates: dedupeByTitle(candidates).slice(0, Math.max(params.limit, env.RERANK_CANDIDATES)),
    degraded,
    notices,
    timings,
    counts: {
      vector: vectorHits.length,
      keyword: keywordHits.length,
      fallback: fallbackHits.length,
    },
  };
}

/**
 * The same song frequently exists as a single, an album cut and a deluxe
 * edition. Collapse on title+artist, keeping the highest scoring copy.
 */
export function dedupeByTitle(items: ScoredMedia[]): ScoredMedia[] {
  const seen = new Map<string, ScoredMedia>();
  for (const item of items) {
    const key = `${item.domain}|${item.title.toLowerCase().replace(/\s*[([].*$/, "").trim()}|${item.subtitle.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}
