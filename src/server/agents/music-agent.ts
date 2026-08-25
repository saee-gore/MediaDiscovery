/**
 * Spotify discovery agent.
 *
 * A thin domain wrapper over the shared pipeline: it pins the domain to music,
 * applies music-specific defaults, and exposes the "more like this track"
 * entry point. Keeping it thin is deliberate — the interesting logic is shared
 * with the film agent, and the differences that matter are in the data
 * (audio features, use-case tags) rather than the control flow.
 */
import type { DiscoveryResponse, MediaSummary, ScoredMedia } from "@/lib/types";
import { discover } from "@/server/agents/discovery";
import { getEnv } from "@/server/config/env";
import { findCategory, MUSIC_CATEGORIES } from "@/data/categories";
import { notFound } from "@/server/lib/errors";
import { fetchMediaById, listMedia } from "@/server/vector/store";
import { retrieve } from "@/server/vector/retrieval";
import { affinityFor } from "@/server/services/preferences";

export interface MusicPreferenceInput {
  genres?: string[];
  moods?: string[];
  energy?: "low" | "medium" | "high" | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  minPopularity?: number | null;
}

export interface MusicSearchParams {
  query: string;
  userId?: string | null;
  limit?: number;
  fastPath?: boolean;
  preferences?: MusicPreferenceInput;
}

/**
 * Dropdown selections become part of the sentence the ranking model reads, so
 * it can weigh them, AND hard filters, so they are actually enforced. Applying
 * only one of the two is how these systems quietly ignore the controls people
 * set.
 */
function preferenceClause(preferences?: MusicPreferenceInput): string {
  if (!preferences) return "";
  const parts: string[] = [];
  if (preferences.genres?.length) parts.push(`in the ${preferences.genres.join(" or ")} genre`);
  if (preferences.moods?.length) parts.push(`feeling ${preferences.moods.join(" and ")}`);
  if (preferences.energy) parts.push(`with ${preferences.energy} energy`);
  if (preferences.yearFrom && preferences.yearTo) {
    parts.push(`released between ${preferences.yearFrom} and ${preferences.yearTo}`);
  } else if (preferences.yearFrom) parts.push(`released ${preferences.yearFrom} or later`);
  else if (preferences.yearTo) parts.push(`released ${preferences.yearTo} or earlier`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

/** The same selections as filters the retrieval layer enforces in SQL. */
function preferenceFilters(preferences?: MusicPreferenceInput) {
  if (!preferences) return undefined;
  const energyBounds =
    preferences.energy === "high"
      ? { minEnergy: 0.7, maxEnergy: undefined }
      : preferences.energy === "medium"
        ? { minEnergy: 0.4, maxEnergy: 0.8 }
        : preferences.energy === "low"
          ? { minEnergy: undefined, maxEnergy: 0.45 }
          : { minEnergy: undefined, maxEnergy: undefined };

  return {
    mediaTypes: ["TRACK" as const],
    genres: preferences.genres?.length ? preferences.genres : undefined,
    moods: preferences.moods?.length ? preferences.moods : undefined,
    yearFrom: preferences.yearFrom ?? undefined,
    yearTo: preferences.yearTo ?? undefined,
    minPopularity: preferences.minPopularity ?? undefined,
    ...energyBounds,
  };
}

/**
 * Spotify's search understands field filters (`genre:`, `year:`) and nothing
 * about mood or feel. Build its query from the structured selections plus any
 * literal words the person typed, and leave the descriptive language to the
 * embedding.
 */
function liveQueryFor(query: string, preferences?: MusicPreferenceInput): string {
  const parts: string[] = [];
  const typed = query.trim();
  if (typed) parts.push(typed);

  for (const genre of preferences?.genres ?? []) parts.push(`genre:"${genre}"`);

  const { yearFrom, yearTo } = preferences ?? {};
  const thisYear = new Date().getFullYear();
  if (yearFrom && yearTo) parts.push(`year:${yearFrom}-${yearTo}`);
  else if (yearFrom) parts.push(`year:${yearFrom}-${thisYear}`);
  else if (yearTo) parts.push(`year:1950-${yearTo}`);

  return parts.join(" ").slice(0, 250);
}

export async function searchMusic(params: MusicSearchParams): Promise<DiscoveryResponse> {
  const response = await discover({
    query: `${params.query}${preferenceClause(params.preferences)}`,
    domainHint: "MUSIC",
    userId: params.userId,
    limit: params.limit,
    fastPath: params.fastPath,
    filterOverrides: preferenceFilters(params.preferences),
    liveQuery: liveQueryFor(params.query, params.preferences),
  });
  // Echo the person's own words back, not the augmented sentence.
  return { ...response, query: params.query };
}

/** Run a browsable category shelf through the same semantic pipeline. */
export async function browseMusicCategory(
  slug: string,
  userId?: string | null,
  limit = 20,
): Promise<DiscoveryResponse> {
  const category = findCategory(slug);
  if (!category) throw notFound("That category");
  return discover({
    query: category.query,
    domainHint: "MUSIC",
    userId,
    limit,
    fastPath: true,
    localOnly: true,
  });
}

export async function trendingMusic(limit = 24): Promise<MediaSummary[]> {
  return listMedia({ domain: "MUSIC" }, limit, "popularity");
}

export async function newMusic(limit = 24): Promise<MediaSummary[]> {
  return listMedia({ domain: "MUSIC" }, limit, "recent");
}

/**
 * "More like this" for a specific track: embed the track's own document
 * instead of a user phrase, which is a purer similarity signal than any
 * sentence a person would type.
 */
export async function similarTracks(
  id: string,
  userId?: string | null,
  limit = 12,
): Promise<ScoredMedia[]> {
  const env = getEnv();
  const seed = await fetchMediaById(id);
  if (!seed) throw notFound("That track");

  const semanticQuery = [
    seed.title,
    seed.subtitle,
    seed.genres.join(", "),
    seed.moods.join(", "),
    seed.themes.join(", "),
    seed.description,
  ]
    .filter(Boolean)
    .join(". ");

  const { candidates } = await retrieve({
    semanticQuery,
    keywordQuery: seed.genres.join(" "),
    filters: {
      domain: "MUSIC",
      mediaTypes: ["TRACK"],
      excludeIds: [id],
    },
    limit: Math.max(limit, env.RESULT_LIMIT),
    affinity: await affinityFor(userId),
  });

  return candidates.slice(0, limit).map((item, index) => ({
    ...item,
    rank: index + 1,
    reason: `Shares ${[...new Set([...item.genres, ...item.moods])]
      .filter((tag) => seed.genres.includes(tag) || seed.moods.includes(tag))
      .slice(0, 3)
      .join(", ") || "a similar sonic profile"} with ${seed.title}.`,
  }));
}

export { MUSIC_CATEGORIES };
