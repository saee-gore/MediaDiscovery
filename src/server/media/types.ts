import type { Domain, MediaType } from "@/lib/types";

/**
 * The provider-neutral shape every source normalises into before it touches
 * the database. Spotify, TMDB and the seed catalogue all emit this; nothing
 * downstream knows or cares which one produced a record.
 */
export interface MediaRecord {
  id: string;
  domain: Domain;
  mediaType: MediaType;
  title: string;
  subtitle: string;
  album?: string | null;
  description: string;
  imageUrl?: string | null;
  externalUrl?: string | null;
  releaseDate?: Date | null;
  releaseYear?: number | null;
  popularity: number;
  rating?: number | null;
  voteCount?: number | null;
  runtimeMin?: number | null;
  seasons?: number | null;
  episodes?: number | null;
  language: string;
  adult: boolean;
  genres: string[];
  moods: string[];
  themes: string[];
  tags: string[];
  energy?: number | null;
  danceability?: number | null;
  valence?: number | null;
  acousticness?: number | null;
  tempo?: number | null;
  tone?: string | null;
  pacing?: string | null;
  intensity?: string | null;
  source: "spotify" | "tmdb" | "seed";
  raw?: unknown;
}
