/**
 * Seed provider — the offline catalogue.
 *
 * Emits exactly the same `MediaRecord` shape as Spotify and TMDB, so the
 * ingestion, enrichment, embedding and retrieval stages cannot tell the
 * difference. That is the point: the app is fully functional before anyone
 * registers for an API key, and adding keys changes the data, not the code.
 */
import { SEED_TRACKS } from "@/data/seed-tracks";
import { SEED_TITLES } from "@/data/seed-titles";
import { mediaId } from "@/server/lib/id";
import type { MediaRecord } from "@/server/media/types";

export function seedTrackRecords(): MediaRecord[] {
  return SEED_TRACKS.map((track) => {
    const releaseDate = new Date(track.released);
    return {
      id: mediaId("seed", "track", track.slug),
      domain: "MUSIC",
      mediaType: "TRACK",
      title: track.title,
      subtitle: track.artist,
      album: track.album,
      description: track.description,
      imageUrl: null,
      externalUrl: null,
      releaseDate,
      releaseYear: releaseDate.getFullYear(),
      popularity: track.popularity,
      rating: null,
      voteCount: null,
      runtimeMin: null,
      seasons: null,
      episodes: null,
      language: "en",
      adult: false,
      genres: track.genres,
      moods: track.moods,
      themes: track.themes,
      tags: [],
      energy: track.energy,
      danceability: track.danceability,
      valence: track.valence,
      acousticness: null,
      tempo: track.tempo,
      tone: null,
      pacing: null,
      intensity: null,
      source: "seed",
      raw: track,
    } satisfies MediaRecord;
  });
}

export function seedTitleRecords(): MediaRecord[] {
  return SEED_TITLES.map((title) => {
    const releaseDate = new Date(title.released);
    return {
      id: mediaId("seed", title.kind === "MOVIE" ? "movie" : "tv", title.slug),
      domain: "VIDEO",
      mediaType: title.kind,
      title: title.title,
      subtitle: title.tagline,
      album: null,
      description: title.description,
      imageUrl: null,
      externalUrl: null,
      releaseDate,
      releaseYear: title.releaseYear,
      popularity: title.popularity,
      rating: title.rating,
      voteCount: null,
      runtimeMin: title.runtimeMin,
      seasons: title.seasons ?? null,
      episodes: title.episodes ?? null,
      language: title.language,
      adult: false,
      genres: title.genres,
      moods: title.moods,
      themes: title.themes,
      tags: title.familyFriendly ? ["family friendly"] : [],
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      tempo: null,
      tone: title.tone,
      pacing: title.pacing,
      intensity: title.intensity,
      source: "seed",
      raw: title,
    } satisfies MediaRecord;
  });
}

export function seedRecords(): MediaRecord[] {
  return [...seedTrackRecords(), ...seedTitleRecords()];
}
