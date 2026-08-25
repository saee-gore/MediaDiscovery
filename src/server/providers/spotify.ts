/**
 * Spotify Web API provider (client-credentials flow).
 *
 * Client credentials give access to the public catalogue — search, albums,
 * artists, new releases — which is everything the discovery pipeline needs.
 * User-scoped endpoints (a person's own library) would require the
 * authorization-code flow and are deliberately out of scope: curation lives in
 * our own database so it works identically with or without a Spotify account.
 *
 * Note on audio features: Spotify restricted `/audio-features` for newly
 * created apps in late 2024. We request it, tolerate a 403/404, and fall back
 * to genre-derived descriptors so enrichment degrades rather than breaks.
 */
import { getEnv } from "@/server/config/env";
import { logger, timed } from "@/server/lib/logger";
import { mediaId } from "@/server/lib/id";
import { fetchJson } from "@/server/providers/http";
import type { MediaRecord } from "@/server/media/types";

const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SERVICE = "Spotify";

interface SpotifyImage {
  url: string;
  width?: number;
  height?: number;
}

interface SpotifyArtistRef {
  id: string;
  name: string;
}

interface SpotifyArtist extends SpotifyArtistRef {
  genres?: string[];
  popularity?: number;
  images?: SpotifyImage[];
}

interface SpotifyAlbum {
  id: string;
  name: string;
  images?: SpotifyImage[];
  release_date?: string;
  release_date_precision?: string;
  artists?: SpotifyArtistRef[];
  album_type?: string;
  total_tracks?: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  popularity?: number;
  explicit?: boolean;
  duration_ms?: number;
  album?: SpotifyAlbum;
  artists?: SpotifyArtistRef[];
  external_urls?: { spotify?: string };
  preview_url?: string | null;
}

interface AudioFeatures {
  id: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  tempo?: number;
  instrumentalness?: number;
}

let token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const env = getEnv();
  if (!env.hasSpotify) throw new Error("Spotify credentials are not configured.");
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;

  const basic = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString(
    "base64",
  );
  const payload = await fetchJson<{ access_token: string; expires_in: number }>(TOKEN_URL, {
    service: SERVICE,
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!payload?.access_token) throw new Error("Spotify did not return an access token.");
  token = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  return token.value;
}

/** Force a token refresh — used when a call comes back 401. */
export function invalidateSpotifyToken(): void {
  token = null;
}

async function api<T>(path: string, softFail: number[] = []): Promise<T | null> {
  const accessToken = await getAccessToken();
  try {
    return await fetchJson<T>(`${API}${path}`, {
      service: SERVICE,
      headers: { Authorization: `Bearer ${accessToken}` },
      softFail,
    });
  } catch (error) {
    // An expired token mid-flight: refresh once and retry.
    if (error instanceof Error && error.message.includes("401")) {
      invalidateSpotifyToken();
      const retryToken = await getAccessToken();
      return fetchJson<T>(`${API}${path}`, {
        service: SERVICE,
        headers: { Authorization: `Bearer ${retryToken}` },
        softFail,
      });
    }
    throw error;
  }
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function fetchAudioFeatures(ids: string[]): Promise<Map<string, AudioFeatures>> {
  const map = new Map<string, AudioFeatures>();
  for (const batch of chunk(ids, 100)) {
    try {
      const payload = await api<{ audio_features: (AudioFeatures | null)[] }>(
        `/audio-features?ids=${batch.join(",")}`,
        [403, 404],
      );
      if (!payload) {
        logger.warn("spotify audio-features unavailable for this app; using genre heuristics", {
          service: SERVICE,
        });
        return map;
      }
      for (const feature of payload.audio_features ?? []) {
        if (feature?.id) map.set(feature.id, feature);
      }
    } catch (error) {
      logger.warn("spotify audio-features request failed; continuing without them", {
        service: SERVICE,
        error: error instanceof Error ? error.message : String(error),
      });
      return map;
    }
  }
  return map;
}

async function fetchArtistGenres(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (const batch of chunk(unique, 50)) {
    const payload = await api<{ artists: (SpotifyArtist | null)[] }>(
      `/artists?ids=${batch.join(",")}`,
      [404],
    );
    for (const artist of payload?.artists ?? []) {
      if (artist?.id) map.set(artist.id, artist.genres ?? []);
    }
  }
  return map;
}

function pickImage(images?: SpotifyImage[]): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[Math.min(1, sorted.length - 1)]?.url ?? sorted[0].url;
}

function parseDate(value?: string, precision?: string): Date | null {
  if (!value) return null;
  const normalised =
    precision === "year" ? `${value}-01-01` : precision === "month" ? `${value}-01` : value;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Turn raw Spotify payloads into the provider-neutral record shape. */
export async function normaliseTracks(tracks: SpotifyTrack[]): Promise<MediaRecord[]> {
  const valid = tracks.filter((track) => track?.id);
  if (valid.length === 0) return [];

  const [features, artistGenres] = await Promise.all([
    fetchAudioFeatures(valid.map((track) => track.id)),
    fetchArtistGenres(valid.flatMap((track) => (track.artists ?? []).map((artist) => artist.id))),
  ]);

  return valid.map((track) => {
    const feature = features.get(track.id);
    const genres = [
      ...new Set((track.artists ?? []).flatMap((artist) => artistGenres.get(artist.id) ?? [])),
    ].slice(0, 6);
    const releaseDate = parseDate(track.album?.release_date, track.album?.release_date_precision);
    const artistNames = (track.artists ?? []).map((artist) => artist.name).join(", ");

    return {
      id: mediaId("spotify", "track", track.id),
      domain: "MUSIC",
      mediaType: "TRACK",
      title: track.name,
      subtitle: artistNames,
      album: track.album?.name ?? null,
      description: `${track.name} by ${artistNames}${track.album?.name ? ` from the album ${track.album.name}` : ""}.`,
      imageUrl: pickImage(track.album?.images),
      externalUrl: track.external_urls?.spotify ?? null,
      releaseDate,
      releaseYear: releaseDate?.getFullYear() ?? null,
      popularity: track.popularity ?? 0,
      rating: null,
      voteCount: null,
      runtimeMin: track.duration_ms ? Math.round(track.duration_ms / 60000) : null,
      seasons: null,
      episodes: null,
      language: "en",
      adult: Boolean(track.explicit),
      genres,
      moods: [],
      themes: [],
      tags: [],
      energy: feature?.energy ?? null,
      danceability: feature?.danceability ?? null,
      valence: feature?.valence ?? null,
      acousticness: feature?.acousticness ?? null,
      tempo: feature?.tempo ?? null,
      tone: null,
      pacing: null,
      intensity: null,
      source: "spotify",
      raw: track,
    } satisfies MediaRecord;
  });
}

export async function searchTracks(query: string, limit = 40): Promise<MediaRecord[]> {
  const env = getEnv();
  return timed("spotify:search", async () => {
    const payload = await api<{ tracks?: { items: SpotifyTrack[] } }>(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=${Math.min(50, limit)}&market=${env.SPOTIFY_MARKET}`,
    );
    return normaliseTracks(payload?.tracks?.items ?? []);
  });
}

/** New albums, flattened to their tracks — the closest public "what's out now". */
export async function fetchNewReleases(limit = 40): Promise<MediaRecord[]> {
  const env = getEnv();
  return timed("spotify:new-releases", async () => {
    const payload = await api<{ albums?: { items: SpotifyAlbum[] } }>(
      `/browse/new-releases?limit=${Math.min(50, limit)}&country=${env.SPOTIFY_MARKET}`,
    );
    const albums = payload?.albums?.items ?? [];
    const tracks: SpotifyTrack[] = [];
    for (const batch of chunk(albums.map((album) => album.id), 20)) {
      const full = await api<{ albums: (SpotifyAlbum & { tracks?: { items: SpotifyTrack[] } })[] }>(
        `/albums?ids=${batch.join(",")}&market=${env.SPOTIFY_MARKET}`,
        [404],
      );
      for (const album of full?.albums ?? []) {
        for (const track of album.tracks?.items?.slice(0, 2) ?? []) {
          tracks.push({ ...track, album });
        }
      }
    }
    return normaliseTracks(tracks);
  });
}

/**
 * Best available proxy for "trending pop this month" using only public
 * endpoints: search the current year's pop releases, then rank by popularity.
 */
export async function fetchGenreCandidates(genre: string, size: number): Promise<MediaRecord[]> {
  const env = getEnv();
  const year = new Date().getFullYear();
  const queries = [
    `genre:"${genre}" year:${year}`,
    `genre:"${genre}" year:${year - 1}`,
    `${genre} hits ${year}`,
  ];
  const seen = new Map<string, MediaRecord>();
  for (const query of queries) {
    const payload = await api<{ tracks?: { items: SpotifyTrack[] } }>(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=50&market=${env.SPOTIFY_MARKET}`,
    );
    const records = await normaliseTracks(payload?.tracks?.items ?? []);
    for (const record of records) if (!seen.has(record.id)) seen.set(record.id, record);
    if (seen.size >= size * 2) break;
  }
  return [...seen.values()].sort((a, b) => b.popularity - a.popularity).slice(0, size * 2);
}

export async function fetchTrackById(externalId: string): Promise<MediaRecord | null> {
  const track = await api<SpotifyTrack>(`/tracks/${externalId}`, [404]);
  if (!track) return null;
  const [record] = await normaliseTracks([track]);
  return record ?? null;
}

/** Spotify's own "related" signal, used to widen a similarity query. */
export async function fetchRelatedArtistNames(artistName: string): Promise<string[]> {
  const search = await api<{ artists?: { items: SpotifyArtist[] } }>(
    `/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
  );
  const artist = search?.artists?.items?.[0];
  if (!artist) return [];
  const related = await api<{ artists: SpotifyArtist[] }>(
    `/artists/${artist.id}/related-artists`,
    [403, 404],
  );
  return (related?.artists ?? []).slice(0, 8).map((a) => a.name);
}
