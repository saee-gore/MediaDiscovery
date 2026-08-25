/**
 * Discovery pipeline — the orchestrator the two domain agents share.
 *
 *   natural language
 *     -> query understanding (LLM, validated; heuristics as fallback)
 *     -> reference resolution ("similar to Interstellar" -> a real catalogue row)
 *     -> filter construction (intent + declared preferences)
 *     -> hybrid retrieval (vector + keyword + popularity + affinity)
 *     -> optional live provider widening for thin result sets
 *     -> AI reranking, restricted to retrieved ids
 *     -> explanation
 *
 * Every stage is individually degradable. The user always gets results from
 * validated catalogue data, and the response says plainly which stages ran.
 */
import type {
  DiscoveryResponse,
  DiscoveryStep,
  Domain,
  MediaType,
  ScoredMedia,
  SearchIntent,
} from "@/lib/types";
import { getEnv } from "@/server/config/env";
import { parseQuery } from "@/server/agents/query-parser";
import { rerank } from "@/server/agents/reranker";
import { logger } from "@/server/lib/logger";
import { searchLive, fetchSimilarLive, providerStatus } from "@/server/providers";
import { ensureEmbedded, upsertRecords } from "@/server/services/catalog";
import { affinityFor, getOrCreatePreferences, recordEvent, recordSearch } from "@/server/services/preferences";
import { retrieve } from "@/server/vector/retrieval";
import { findArtistProfile, findByTitle, type RetrievalFilters } from "@/server/vector/store";

export interface DiscoverParams {
  query: string;
  domainHint?: Domain | "BOTH";
  userId?: string | null;
  limit?: number;
  /** Skip the LLM rerank stage (used for category shelves, where speed wins). */
  fastPath?: boolean;
  /** Skip live provider widening. */
  localOnly?: boolean;
  excludeIds?: string[];
  /**
   * Hard filters from structured UI controls. These are applied on top of
   * whatever the query parser inferred and win where they overlap — a filter
   * a person set explicitly must never be softened by a model's reading of
   * their sentence.
   */
  filterOverrides?: Partial<RetrievalFilters>;
  /**
   * Term to send upstream when widening from a live provider.
   *
   * Provider search is keyword-only and understands its own field syntax, so
   * the sentence we embed is the wrong thing to forward. The domain agents
   * build this from the structured filters instead — `genre:"pop" year:2020-2029`
   * is a far better Spotify query than "something good to listen to".
   */
  liveQuery?: string;
}

export async function discover(params: DiscoverParams): Promise<DiscoveryResponse> {
  const env = getEnv();
  const started = Date.now();
  const steps: DiscoveryStep[] = [];
  const notices: string[] = [];
  const timings: Record<string, number> = {};
  const limit = Math.min(50, params.limit ?? env.RESULT_LIMIT);

  // --- 1. understand --------------------------------------------------------
  const parseStart = Date.now();
  const intent = await parseQuery(params.query, {
    domainHint: params.domainHint,
    limit: params.limit,
  });
  timings.parse = Date.now() - parseStart;
  steps.push({
    label: "Understanding your request",
    detail: describeIntent(intent),
    status: intent.degraded ? "skipped" : "ok",
  });
  if (intent.degraded) {
    notices.push("The language model wasn't available, so the request was parsed with keyword rules.");
  }

  const domain: Domain = intent.domain === "BOTH"
    ? params.domainHint && params.domainHint !== "BOTH"
      ? params.domainHint
      : "VIDEO"
    : intent.domain;
  const searchDomain = intent.domain === "BOTH" && !params.domainHint ? undefined : domain;

  // --- 2. resolve references ------------------------------------------------
  const excludeIds = [...(params.excludeIds ?? [])];
  let semanticQuery = intent.semanticQuery;
  const resolved: string[] = [];
  const referenceProfile = { genres: [] as string[], moods: [] as string[], themes: [] as string[] };

  for (const reference of intent.similarTo.slice(0, 3)) {
    // A title match is the precise case; an artist match is the common one in
    // music ("like Dua Lipa"). Try the precise one first.
    const match = await findByTitle(reference, searchDomain);
    if (match) {
      resolved.push(match.title);
      excludeIds.push(match.id);
      referenceProfile.genres.push(...match.genres);
      referenceProfile.moods.push(...match.moods);
      referenceProfile.themes.push(...match.themes);
      // Describe the reference in the query so the embedding moves toward it.
      semanticQuery = `${semanticQuery}. Similar in feel to ${match.title}: ${[
        ...match.genres.slice(0, 3),
        ...match.moods.slice(0, 3),
        ...match.themes.slice(0, 3),
      ].join(", ")}`;

      if (!params.localOnly) {
        const similar = await fetchSimilarLive(match.id, 12);
        if (similar.length) {
          const { ids } = await upsertRecords(similar);
          await ensureEmbedded(ids);
        }
      }
      continue;
    }

    if (searchDomain === "MUSIC" || searchDomain === undefined) {
      const profile = await findArtistProfile(reference);
      if (profile) {
        resolved.push(profile.artist);
        // "Like X" means music that sounds like X's — not X's back catalogue.
        excludeIds.push(...profile.ids);
        referenceProfile.genres.push(...profile.genres);
        referenceProfile.moods.push(...profile.moods);
        referenceProfile.themes.push(...profile.themes);
        semanticQuery = `${semanticQuery}. In the style of ${profile.artist}: ${[
          ...profile.genres,
          ...profile.moods,
          ...profile.themes,
        ].join(", ")}`;

        if (!params.localOnly) {
          const widened = await searchLive("MUSIC", `${profile.artist} similar artists`, 20);
          if (widened.length) {
            const { ids } = await upsertRecords(widened);
            await ensureEmbedded(ids);
          }
        }
      }
    }
  }
  steps.push({
    label: "Matching your references",
    detail: resolved.length
      ? `Anchored on ${resolved.join(", ")}`
      : intent.similarTo.length
        ? `Couldn't find ${intent.similarTo.join(", ")} in the catalogue, using the description instead`
        : "No specific titles referenced",
    status: intent.similarTo.length === 0 ? "skipped" : resolved.length ? "ok" : "failed",
  });

  // --- 3. filters -----------------------------------------------------------
  const filters = await buildFilters(
    intent,
    searchDomain,
    params.userId,
    excludeIds,
    params.filterOverrides,
  );
  steps.push({
    label: "Applying filters",
    detail: describeFilters(filters) || "No hard filters, ranking on meaning alone",
    status: "ok",
  });

  // --- 4. retrieve ----------------------------------------------------------
  const affinity = await affinityFor(params.userId);
  const hasReference = referenceProfile.genres.length > 0 || referenceProfile.moods.length > 0;
  const retrieveArgs = {
    semanticQuery,
    keywordQuery: [params.query, ...intent.keywords].join(" "),
    filters,
    limit,
    affinity,
    referenceProfile: hasReference ? referenceProfile : undefined,
  };
  let retrieval = await retrieve(retrieveArgs);
  Object.assign(timings, retrieval.timings);
  notices.push(...retrieval.notices);

  // --- 5. widen from live providers when thin -------------------------------
  const status = providerStatus();
  const liveAvailable =
    (searchDomain === "MUSIC" && status.music === "spotify") ||
    (searchDomain === "VIDEO" && status.video === "tmdb") ||
    (!searchDomain && (status.music === "spotify" || status.video === "tmdb"));

  if (!params.localOnly && liveAvailable && retrieval.candidates.length < limit) {
    const widenStart = Date.now();
    try {
      const upstreamQuery = params.liveQuery?.trim() || params.query;
      const fetched = await searchLive(searchDomain ?? "VIDEO", upstreamQuery, 25);
      if (fetched.length) {
        const { ids } = await upsertRecords(fetched);
        await ensureEmbedded(ids);
        retrieval = await retrieve(retrieveArgs);
      }
      timings.widen = Date.now() - widenStart;
      steps.push({
        label: "Fetching fresh results",
        detail: fetched.length
          ? `Pulled ${fetched.length} more from ${searchDomain === "MUSIC" ? "Spotify" : "TMDB"}`
          : "Nothing new upstream",
        status: fetched.length ? "ok" : "skipped",
      });
    } catch (error) {
      timings.widen = Date.now() - widenStart;
      logger.warn("live widening failed", { error });
      steps.push({ label: "Fetching fresh results", detail: "Upstream unavailable", status: "failed" });
      notices.push("We couldn't reach the live catalogue, so these come from what we already had.");
    }
  }

  steps.push({
    label: "Searching the catalogue",
    detail: `${retrieval.counts.vector} semantic, ${retrieval.counts.keyword} keyword, ${retrieval.candidates.length} candidates`,
    status: retrieval.candidates.length ? "ok" : "failed",
  });

  if (retrieval.candidates.length === 0) {
    return {
      query: params.query,
      intent,
      results: [],
      summary: "",
      steps,
      degraded: intent.degraded || retrieval.degraded,
      notices: [...new Set([...notices, "No strong matches found. Try making your request broader."])],
      timings: { ...timings, total: Date.now() - started },
    };
  }

  // --- 6. rerank + explain --------------------------------------------------
  let results: ScoredMedia[];
  let summary: string;
  if (params.fastPath) {
    results = retrieval.candidates.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
    summary = "";
    steps.push({ label: "Ranking results", detail: "Retrieval order (fast path)", status: "skipped" });
  } else {
    const rerankStart = Date.now();
    const reranked = await rerank(params.query, intent, retrieval.candidates, limit);
    timings.rerank = Date.now() - rerankStart;
    results = reranked.items;
    summary = reranked.summary;
    steps.push({
      label: "Ranking and explaining",
      detail: reranked.reranked
        ? `Model reordered ${results.length} picks`
        : "Model unavailable, ranked on retrieval score",
      status: reranked.reranked ? "ok" : "skipped",
    });
    if (!reranked.reranked && !intent.degraded) {
      notices.push("Explanations are metadata-based right now. The model didn't respond in time.");
    }
  }

  // --- 7. record ------------------------------------------------------------
  const totalMs = Date.now() - started;
  timings.total = totalMs;

  if (params.userId) {
    await recordSearch({
      userId: params.userId,
      domain: domain,
      query: params.query,
      parsed: intent,
      resultCount: results.length,
      latencyMs: totalMs,
    });
  }
  await Promise.all(
    results.slice(0, 10).map((item, index) =>
      recordEvent({
        userId: params.userId,
        domain: item.domain,
        action: "SHOWN",
        media: item,
        query: params.query,
        score: item.score,
        position: index + 1,
      }),
    ),
  );

  return {
    query: params.query,
    intent,
    results,
    summary,
    steps,
    degraded: intent.degraded || retrieval.degraded,
    notices: [...new Set(notices)],
    timings,
  };
}

async function buildFilters(
  intent: SearchIntent,
  domain: Domain | undefined,
  userId: string | null | undefined,
  excludeIds: string[],
  overrides?: Partial<RetrievalFilters>,
): Promise<RetrievalFilters> {
  const mediaTypes: MediaType[] = intent.mediaTypes.length
    ? intent.mediaTypes
    : domain === "MUSIC"
      ? ["TRACK"]
      : domain === "VIDEO"
        ? ["MOVIE", "SERIES"]
        : [];

  const filters: RetrievalFilters = {
    domain,
    mediaTypes: mediaTypes.length ? mediaTypes : undefined,
    // Genres are applied as a filter only when the user was explicit; otherwise
    // they stay in the embedding text so near-genres can still surface.
    genres: intent.genres.length ? intent.genres : undefined,
    languages: intent.languages.length ? intent.languages : undefined,
    yearFrom: intent.yearFrom,
    yearTo: intent.yearTo,
    maxRuntimeMinutes: intent.maxRuntimeMinutes,
    minRating: intent.minRating,
    familyFriendly: intent.familyFriendly,
    excludeIds: excludeIds.length ? excludeIds : undefined,
    avoid: intent.avoid.length ? intent.avoid : undefined,
  };

  if (!userId) return applyOverrides(filters, overrides);

  const preferences = await getOrCreatePreferences(userId);
  if (!preferences.personalizationEnabled) return applyOverrides(filters, overrides);

  // Declared preferences add constraints the request didn't contradict.
  if (preferences.familyFriendlyOnly) filters.familyFriendly = true;
  if (preferences.maxRuntimeMinutes && !filters.maxRuntimeMinutes) {
    filters.maxRuntimeMinutes = preferences.maxRuntimeMinutes;
  }
  if (preferences.avoidedGenres.length) {
    filters.avoid = [...new Set([...(filters.avoid ?? []), ...preferences.avoidedGenres])];
  }
  return applyOverrides(filters, overrides);
}

/** Explicit UI selections beat inferred ones; undefined entries are ignored. */
function applyOverrides(
  filters: RetrievalFilters,
  overrides?: Partial<RetrievalFilters>,
): RetrievalFilters {
  if (!overrides) return filters;
  const merged: RetrievalFilters = { ...filters };
  for (const [key, value] of Object.entries(overrides) as Array<
    [keyof RetrievalFilters, RetrievalFilters[keyof RetrievalFilters]]
  >) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === "avoid" || key === "excludeIds") {
      const existing = (merged[key] as string[] | undefined) ?? [];
      merged[key] = [...new Set([...existing, ...(value as string[])])] as never;
    } else {
      merged[key] = value as never;
    }
  }
  return merged;
}

function describeIntent(intent: SearchIntent): string {
  const parts = [
    intent.domain === "MUSIC" ? "Music" : intent.domain === "VIDEO" ? "Film & TV" : "Anything",
    intent.genres.length ? intent.genres.join(", ") : null,
    intent.moods.length ? intent.moods.join(", ") : null,
    intent.similarTo.length ? `like ${intent.similarTo.join(", ")}` : null,
    intent.useCase ? `for ${intent.useCase}` : null,
    intent.maxRuntimeMinutes ? `under ${intent.maxRuntimeMinutes} min` : null,
    intent.avoid.length ? `avoiding ${intent.avoid.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function describeFilters(filters: RetrievalFilters): string {
  const parts = [
    filters.mediaTypes?.length ? filters.mediaTypes.join("/") : null,
    filters.genres?.length ? `genre ${filters.genres.join(", ")}` : null,
    filters.yearFrom ? `from ${filters.yearFrom}` : null,
    filters.yearTo ? `to ${filters.yearTo}` : null,
    filters.maxRuntimeMinutes ? `≤${filters.maxRuntimeMinutes} min` : null,
    filters.minRating ? `rated ≥${filters.minRating}` : null,
    filters.familyFriendly ? "family friendly" : null,
    filters.avoid?.length ? `excluding ${filters.avoid.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
