/**
 * TMDB provider for movies and series.
 *
 * TMDB gives us genres, overviews, ratings, runtimes and — importantly —
 * keywords, which are the closest thing it has to themes. Tone, pacing and
 * emotional intensity are derived in the enrichment step from those signals;
 * TMDB does not publish them.
 */
import { getEnv } from "@/server/config/env";
import { mediaId } from "@/server/lib/id";
import { timed } from "@/server/lib/logger";
import { fetchJson } from "@/server/providers/http";
import type { MediaRecord } from "@/server/media/types";

const API = "https://api.themoviedb.org/3";
const SERVICE = "TMDB";

interface TmdbGenre {
  id: number;
  name: string;
}

interface TmdbResult {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
  original_language?: string;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  keywords?: { keywords?: TmdbGenre[]; results?: TmdbGenre[] };
}

let genreCache: { movie: Map<number, string>; tv: Map<number, string> } | null = null;

function key(): string {
  const env = getEnv();
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured.");
  return env.TMDB_API_KEY;
}

async function api<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const env = getEnv();
  const search = new URLSearchParams({
    api_key: key(),
    language: env.TMDB_LANGUAGE,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return fetchJson<T>(`${API}${path}?${search.toString()}`, { service: SERVICE, softFail: [404] });
}

async function genreMaps() {
  if (genreCache) return genreCache;
  const [movie, tv] = await Promise.all([
    api<{ genres: TmdbGenre[] }>("/genre/movie/list"),
    api<{ genres: TmdbGenre[] }>("/genre/tv/list"),
  ]);
  genreCache = {
    movie: new Map((movie?.genres ?? []).map((g) => [g.id, g.name.toLowerCase()])),
    tv: new Map((tv?.genres ?? []).map((g) => [g.id, g.name.toLowerCase()])),
  };
  return genreCache;
}

function imageUrl(path?: string | null): string | null {
  if (!path) return null;
  return `${getEnv().TMDB_IMAGE_BASE}${path}`;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * TMDB popularity is an unbounded float; the rest of the system assumes 0–100.
 * A log squash keeps ordering while bounding the range.
 */
function normalisePopularity(raw?: number): number {
  if (!raw || raw <= 0) return 0;
  return Math.min(100, Math.round((Math.log10(raw + 1) / Math.log10(2000)) * 100));
}

export async function normaliseResults(
  results: TmdbResult[],
  kindHint?: "movie" | "tv",
): Promise<MediaRecord[]> {
  const maps = await genreMaps();
  const out: MediaRecord[] = [];

  for (const result of results) {
    const kind = (result.media_type ?? kindHint ?? (result.title ? "movie" : "tv")) as
      | "movie"
      | "tv"
      | "person";
    if (kind === "person") continue;

    const isMovie = kind === "movie";
    const title = result.title ?? result.name ?? result.original_title ?? result.original_name;
    if (!title) continue;

    const genres = result.genres?.length
      ? result.genres.map((g) => g.name.toLowerCase())
      : (result.genre_ids ?? [])
          .map((id) => (isMovie ? maps.movie.get(id) : maps.tv.get(id)))
          .filter((name): name is string => Boolean(name));

    const keywords = [
      ...(result.keywords?.keywords ?? []),
      ...(result.keywords?.results ?? []),
    ].map((k) => k.name.toLowerCase());

    const releaseDate = parseDate(isMovie ? result.release_date : result.first_air_date);
    const runtime = isMovie ? result.runtime : result.episode_run_time?.[0];

    out.push({
      id: mediaId("tmdb", isMovie ? "movie" : "tv", String(result.id)),
      domain: "VIDEO",
      mediaType: isMovie ? "MOVIE" : "SERIES",
      title,
      subtitle: result.tagline ?? "",
      album: null,
      description: result.overview ?? "",
      imageUrl: imageUrl(result.poster_path ?? result.backdrop_path),
      externalUrl: `https://www.themoviedb.org/${isMovie ? "movie" : "tv"}/${result.id}`,
      releaseDate,
      releaseYear: releaseDate?.getFullYear() ?? null,
      popularity: normalisePopularity(result.popularity),
      rating: result.vote_average ?? null,
      voteCount: result.vote_count ?? null,
      runtimeMin: runtime ?? null,
      seasons: result.number_of_seasons ?? null,
      episodes: result.number_of_episodes ?? null,
      language: result.original_language ?? "en",
      adult: Boolean(result.adult),
      genres,
      moods: [],
      themes: keywords.slice(0, 10),
      tags: [],
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      tempo: null,
      tone: null,
      pacing: null,
      intensity: null,
      source: "tmdb",
      raw: result,
    });
  }

  return out;
}

/** Full detail (runtime, seasons, keywords) for a single title. */
export async function fetchTitleDetail(
  kind: "movie" | "tv",
  externalId: string,
): Promise<MediaRecord | null> {
  const detail = await api<TmdbResult>(`/${kind}/${externalId}`, { append_to_response: "keywords" });
  if (!detail) return null;
  const [record] = await normaliseResults([{ ...detail, media_type: kind }], kind);
  return record ?? null;
}

export async function searchTitles(query: string, limit = 30): Promise<MediaRecord[]> {
  return timed("tmdb:search", async () => {
    const payload = await api<{ results: TmdbResult[] }>("/search/multi", {
      query,
      include_adult: "false",
      page: 1,
    });
    const results = (payload?.results ?? []).filter((r) => r.media_type !== "person").slice(0, limit);
    return normaliseResults(results);
  });
}

export async function fetchTrending(window: "day" | "week" = "week", limit = 40): Promise<MediaRecord[]> {
  return timed("tmdb:trending", async () => {
    const payload = await api<{ results: TmdbResult[] }>(`/trending/all/${window}`);
    return normaliseResults((payload?.results ?? []).slice(0, limit));
  });
}

/**
 * Broad catalogue pull used by ingestion — several pages of well-rated,
 * reasonably popular titles across both movies and series.
 */
export async function discoverCatalogue(pages = 3): Promise<MediaRecord[]> {
  const records: MediaRecord[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const [movies, shows] = await Promise.all([
      api<{ results: TmdbResult[] }>("/discover/movie", {
        page,
        sort_by: "popularity.desc",
        "vote_count.gte": 300,
        include_adult: "false",
      }),
      api<{ results: TmdbResult[] }>("/discover/tv", {
        page,
        sort_by: "popularity.desc",
        "vote_count.gte": 150,
      }),
    ]);
    records.push(...(await normaliseResults(movies?.results ?? [], "movie")));
    records.push(...(await normaliseResults(shows?.results ?? [], "tv")));
  }
  return records;
}

/** TMDB's own similarity signal, used to widen "something like X" queries. */
export async function fetchSimilar(
  kind: "movie" | "tv",
  externalId: string,
  limit = 20,
): Promise<MediaRecord[]> {
  const payload = await api<{ results: TmdbResult[] }>(`/${kind}/${externalId}/similar`);
  return normaliseResults((payload?.results ?? []).slice(0, limit), kind);
}
