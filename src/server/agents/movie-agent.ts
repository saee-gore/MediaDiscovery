/**
 * Movie and series recommendation agent.
 *
 * Same pipeline as music, with the structured preference panel folded in: the
 * UI's filter controls are translated into an additional natural-language
 * clause plus hard filters, so a person can mix "smart sci-fi, nothing too
 * violent" with "series only, under 45 minutes an episode" and have both
 * respected.
 */
import type { DiscoveryResponse, MediaSummary, MediaType, ScoredMedia } from "@/lib/types";
import { discover } from "@/server/agents/discovery";
import { findCategory, VIDEO_CATEGORIES } from "@/data/categories";
import { getEnv } from "@/server/config/env";
import { notFound } from "@/server/lib/errors";
import { affinityFor } from "@/server/services/preferences";
import { retrieve } from "@/server/vector/retrieval";
import { fetchMediaById, listMedia } from "@/server/vector/store";

export interface VideoPreferenceInput {
  mediaTypes?: MediaType[];
  genres?: string[];
  moods?: string[];
  languages?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  maxRuntimeMinutes?: number | null;
  minRating?: number | null;
  familyFriendly?: boolean | null;
  tone?: "light" | "balanced" | "serious" | "dark" | null;
  minPopularity?: number | null;
}

export interface VideoSearchParams {
  query: string;
  userId?: string | null;
  limit?: number;
  fastPath?: boolean;
  preferences?: VideoPreferenceInput;
}

/**
 * Structured panel selections become part of the sentence the model reads, so
 * the reranker can weigh them, *and* hard filters, so they are actually
 * enforced. Doing only one of the two is how these systems quietly ignore the
 * controls people set.
 */
function preferenceClause(preferences?: VideoPreferenceInput): string {
  if (!preferences) return "";
  const parts: string[] = [];
  if (preferences.mediaTypes?.length === 1) {
    parts.push(preferences.mediaTypes[0] === "SERIES" ? "a television series" : "a film");
  }
  if (preferences.genres?.length) parts.push(`in the ${preferences.genres.join(" or ")} genre`);
  if (preferences.moods?.length) parts.push(`feeling ${preferences.moods.join(" and ")}`);
  if (preferences.tone) parts.push(`with a ${preferences.tone} tone`);
  if (preferences.maxRuntimeMinutes) parts.push(`no longer than ${preferences.maxRuntimeMinutes} minutes`);
  if (preferences.yearFrom && preferences.yearTo) parts.push(`released between ${preferences.yearFrom} and ${preferences.yearTo}`);
  else if (preferences.yearFrom) parts.push(`released ${preferences.yearFrom} or later`);
  else if (preferences.yearTo) parts.push(`released ${preferences.yearTo} or earlier`);
  if (preferences.minRating) parts.push(`rated at least ${preferences.minRating} out of 10`);
  if (preferences.familyFriendly) parts.push("suitable for the whole family");
  if (preferences.languages?.length) parts.push(`in ${preferences.languages.join(" or ")}`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

/** The same selections, expressed as filters the retrieval layer enforces. */
function preferenceFilters(preferences?: VideoPreferenceInput) {
  if (!preferences) return undefined;
  return {
    mediaTypes: preferences.mediaTypes?.length ? preferences.mediaTypes : undefined,
    genres: preferences.genres?.length ? preferences.genres : undefined,
    moods: preferences.moods?.length ? preferences.moods : undefined,
    languages: preferences.languages?.length ? preferences.languages : undefined,
    yearFrom: preferences.yearFrom ?? undefined,
    yearTo: preferences.yearTo ?? undefined,
    maxRuntimeMinutes: preferences.maxRuntimeMinutes ?? undefined,
    minRating: preferences.minRating ?? undefined,
    minPopularity: preferences.minPopularity ?? undefined,
    familyFriendly: preferences.familyFriendly ?? undefined,
  };
}

/**
 * TMDB search is plain-text title matching, so the person's own words are the
 * right thing to forward. When they typed nothing, fall back to the genres they
 * picked rather than sending a filler sentence.
 */
function liveQueryFor(query: string, preferences?: VideoPreferenceInput): string {
  const typed = query.trim();
  if (typed) return typed.slice(0, 250);
  return [...(preferences?.genres ?? []), ...(preferences?.moods ?? [])].join(" ").slice(0, 250);
}

export async function searchVideo(params: VideoSearchParams): Promise<DiscoveryResponse> {
  const query = `${params.query}${preferenceClause(params.preferences)}`;
  const response = await discover({
    query,
    domainHint: "VIDEO",
    userId: params.userId,
    limit: params.limit,
    fastPath: params.fastPath,
    filterOverrides: preferenceFilters(params.preferences),
    liveQuery: liveQueryFor(params.query, params.preferences),
  });
  // Report the user's own words back, not the augmented sentence.
  return { ...response, query: params.query };
}

export async function browseVideoCategory(
  slug: string,
  userId?: string | null,
  limit = 20,
): Promise<DiscoveryResponse> {
  const category = findCategory(slug);
  if (!category) throw notFound("That category");
  return discover({
    query: category.query,
    domainHint: "VIDEO",
    userId,
    limit,
    fastPath: true,
    localOnly: true,
  });
}

export async function trendingVideo(limit = 24, mediaType?: MediaType): Promise<MediaSummary[]> {
  return listMedia(
    { domain: "VIDEO", mediaTypes: mediaType ? [mediaType] : undefined },
    limit,
    "popularity",
  );
}

export async function similarTitles(
  id: string,
  userId?: string | null,
  limit = 12,
): Promise<ScoredMedia[]> {
  const env = getEnv();
  const seed = await fetchMediaById(id);
  if (!seed) throw notFound("That title");

  const semanticQuery = [
    seed.title,
    seed.genres.join(", "),
    seed.moods.join(", "),
    seed.themes.join(", "),
    seed.tone ? `${seed.tone} tone` : "",
    seed.pacing ? `${seed.pacing} pacing` : "",
    seed.description,
  ]
    .filter(Boolean)
    .join(". ");

  const { candidates } = await retrieve({
    semanticQuery,
    keywordQuery: [...seed.genres, ...seed.themes].join(" "),
    filters: { domain: "VIDEO", excludeIds: [id] },
    limit: Math.max(limit, env.RESULT_LIMIT),
    affinity: await affinityFor(userId),
  });

  return candidates.slice(0, limit).map((item, index) => {
    const shared = [...new Set([...item.genres, ...item.themes])]
      .filter((tag) => seed.genres.includes(tag) || seed.themes.includes(tag))
      .slice(0, 3);
    return {
      ...item,
      rank: index + 1,
      reason: shared.length
        ? `Shares ${shared.join(", ")} with ${seed.title}.`
        : `Sits close to ${seed.title} in tone and subject matter.`,
    };
  });
}

export { VIDEO_CATEGORIES };
