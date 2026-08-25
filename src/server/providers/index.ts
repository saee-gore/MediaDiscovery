/**
 * Provider selection.
 *
 * One decision point for "where does catalogue data come from", so no service
 * downstream repeats the credentials check. Live providers are used when their
 * credentials exist; if a live call fails at ingest time we fall back to the
 * seed catalogue rather than leaving the app with an empty database.
 */
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/lib/logger";
import type { MediaRecord } from "@/server/media/types";
import * as seed from "@/server/providers/seed";
import * as spotify from "@/server/providers/spotify";
import * as tmdb from "@/server/providers/tmdb";

export interface ProviderStatus {
  music: "spotify" | "seed";
  video: "tmdb" | "seed";
}

export function providerStatus(): ProviderStatus {
  const env = getEnv();
  return {
    music: env.hasSpotify ? "spotify" : "seed",
    video: env.hasTmdb ? "tmdb" : "seed",
  };
}

async function withFallback<T>(
  label: string,
  live: () => Promise<T[]>,
  fallback: () => T[],
): Promise<{ records: T[]; source: "live" | "seed" }> {
  try {
    const records = await live();
    if (records.length > 0) return { records, source: "live" };
    logger.warn("provider returned nothing; using seed catalogue", { provider: label });
  } catch (error) {
    logger.warn("provider call failed; using seed catalogue", {
      provider: label,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { records: fallback(), source: "seed" };
}

/** Everything the ingestion job should load for music. */
export async function collectMusicCatalogue(): Promise<{
  records: MediaRecord[];
  source: "live" | "seed";
}> {
  const env = getEnv();
  if (!env.hasSpotify) return { records: seed.seedTrackRecords(), source: "seed" };

  return withFallback(
    "spotify",
    async () => {
      const [pop, releases] = await Promise.all([
        spotify.fetchGenreCandidates("pop", env.TOP50_CHART_SIZE),
        spotify.fetchNewReleases(40),
      ]);
      const extraGenres = ["rock", "hip-hop", "r&b", "indie", "electronic", "country", "latin", "k-pop"];
      const others: MediaRecord[] = [];
      for (const genre of extraGenres) {
        others.push(...(await spotify.searchTracks(`genre:"${genre}"`, 20)));
      }
      return dedupe([...pop, ...releases, ...others]);
    },
    seed.seedTrackRecords,
  );
}

/** Everything the ingestion job should load for movies and series. */
export async function collectVideoCatalogue(): Promise<{
  records: MediaRecord[];
  source: "live" | "seed";
}> {
  const env = getEnv();
  if (!env.hasTmdb) return { records: seed.seedTitleRecords(), source: "seed" };

  return withFallback(
    "tmdb",
    async () => {
      const [catalogue, trending] = await Promise.all([
        tmdb.discoverCatalogue(3),
        tmdb.fetchTrending("week", 40),
      ]);
      return dedupe([...catalogue, ...trending]);
    },
    seed.seedTitleRecords,
  );
}

/** Live keyword search, used to widen the candidate pool for a fresh query. */
export async function searchLive(
  domain: "MUSIC" | "VIDEO",
  query: string,
  limit = 25,
): Promise<MediaRecord[]> {
  const env = getEnv();
  try {
    if (domain === "MUSIC") {
      if (!env.hasSpotify) return [];
      return await spotify.searchTracks(query, limit);
    }
    if (!env.hasTmdb) return [];
    return await tmdb.searchTitles(query, limit);
  } catch (error) {
    logger.warn("live search failed; continuing with local catalogue only", {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function fetchTrendingVideo(limit = 40): Promise<MediaRecord[]> {
  const env = getEnv();
  if (!env.hasTmdb) {
    return seed
      .seedTitleRecords()
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }
  const { records } = await withFallback(
    "tmdb:trending",
    () => tmdb.fetchTrending("week", limit),
    () => seed.seedTitleRecords().sort((a, b) => b.popularity - a.popularity).slice(0, limit),
  );
  return records;
}

/** Candidates for the monthly pop chart. */
export async function fetchChartCandidates(size: number): Promise<{
  records: MediaRecord[];
  source: "spotify" | "seed";
}> {
  const env = getEnv();
  if (!env.hasSpotify) {
    return { records: seed.seedTrackRecords(), source: "seed" };
  }
  const { records, source } = await withFallback(
    "spotify:chart",
    () => spotify.fetchGenreCandidates("pop", size),
    seed.seedTrackRecords,
  );
  return { records, source: source === "live" ? "spotify" : "seed" };
}

/** Resolve a namespaced media id back to a live provider record. */
export async function fetchRecordById(id: string): Promise<MediaRecord | null> {
  const [source, kind, externalId] = id.split(":");
  try {
    if (source === "spotify" && kind === "track") return await spotify.fetchTrackById(externalId);
    if (source === "tmdb" && (kind === "movie" || kind === "tv")) {
      return await tmdb.fetchTitleDetail(kind, externalId);
    }
  } catch (error) {
    logger.warn("provider lookup failed", { id, error });
  }
  return null;
}

/** Provider-native "more like this", used to widen similarity queries. */
export async function fetchSimilarLive(id: string, limit = 20): Promise<MediaRecord[]> {
  const [source, kind, externalId] = id.split(":");
  try {
    if (source === "tmdb" && (kind === "movie" || kind === "tv")) {
      return await tmdb.fetchSimilar(kind, externalId, limit);
    }
  } catch (error) {
    logger.warn("provider similarity lookup failed", { id, error });
  }
  return [];
}

export async function relatedArtists(artist: string): Promise<string[]> {
  const env = getEnv();
  if (!env.hasSpotify) return [];
  try {
    return await spotify.fetchRelatedArtistNames(artist);
  } catch {
    return [];
  }
}

function dedupe(records: MediaRecord[]): MediaRecord[] {
  const map = new Map<string, MediaRecord>();
  for (const record of records) if (!map.has(record.id)) map.set(record.id, record);
  return [...map.values()];
}

export { seed, spotify, tmdb };
