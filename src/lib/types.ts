/**
 * Shared DTOs. These cross the API boundary, so both the route handlers and the
 * React components import them — one definition, no drift.
 */

export type Domain = "MUSIC" | "VIDEO";
export type MediaType = "TRACK" | "MOVIE" | "SERIES";
export type CollectionSource = "MANUAL" | "AI" | "SEARCH";
export type EventAction = "SHOWN" | "OPENED" | "SAVED" | "REMOVED" | "DISMISSED" | "WATCHED";

export interface MediaSummary {
  id: string;
  domain: Domain;
  mediaType: MediaType;
  title: string;
  /** Artist(s) for music, tagline for video. */
  subtitle: string;
  album?: string | null;
  description: string;
  imageUrl?: string | null;
  externalUrl?: string | null;
  releaseDate?: string | null;
  releaseYear?: number | null;
  /** 0–100. */
  popularity: number;
  /** 0–10 for video, null for music. */
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
  source: string;
}

/** A catalogue item plus the retrieval evidence behind its placement. */
export interface ScoredMedia extends MediaSummary {
  score: number;
  vectorScore: number;
  keywordScore: number;
  popularityScore: number;
  affinityScore: number;
  /** Which signals actually fired, for the "why" panel. */
  matchedOn: string[];
  /** Filled in by the reranker/explainer when the LLM is available. */
  reason?: string | null;
  rank?: number;
}

export interface SearchIntent {
  intent:
    | "music_recommendation"
    | "music_search"
    | "video_recommendation"
    | "video_search"
    | "mixed";
  domain: Domain | "BOTH";
  /** Cleaned-up semantic phrase used for embedding, free of filter noise. */
  semanticQuery: string;
  keywords: string[];
  genres: string[];
  moods: string[];
  themes: string[];
  similarTo: string[];
  mediaTypes: MediaType[];
  languages: string[];
  useCase?: string | null;
  tone?: "light" | "balanced" | "serious" | "dark" | null;
  pacing?: "slow" | "moderate" | "brisk" | "relentless" | null;
  energy?: "low" | "medium" | "high" | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  releasePeriod?: "recent" | "this_year" | "classic" | "any" | null;
  maxRuntimeMinutes?: number | null;
  minRating?: number | null;
  familyFriendly?: boolean | null;
  avoid: string[];
  limit?: number | null;
  /** True when the parse came from a heuristic fallback, not the LLM. */
  degraded?: boolean;
}

export interface DiscoveryResponse {
  query: string;
  intent: SearchIntent;
  results: ScoredMedia[];
  summary: string;
  /** Human-readable trace shown in the UI progress panel. */
  steps: DiscoveryStep[];
  degraded: boolean;
  notices: string[];
  timings: Record<string, number>;
}

export interface DiscoveryStep {
  label: string;
  detail?: string;
  status: "ok" | "skipped" | "failed";
}

export interface ChartEntryDto {
  rank: number;
  previousRank: number | null;
  movement: number | null;
  isNewEntry: boolean;
  peakRank: number | null;
  weeksOnChart: number;
  score: number;
  media: MediaSummary;
}

export interface ChartDto {
  chartId: string;
  period: string;
  label: string;
  generatedAt: string;
  itemCount: number;
  source: string;
  entries: ChartEntryDto[];
  availablePeriods: string[];
}

export interface PlaylistItemDto {
  id: string;
  mediaId: string | null;
  position: number;
  note: string | null;
  addedAt: string;
  media: MediaSummary;
}

export interface PlaylistDto {
  id: string;
  name: string;
  description: string;
  source: CollectionSource;
  seedQuery: string | null;
  accent: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  items?: PlaylistItemDto[];
  /** Small preview used on list cards. */
  preview?: MediaSummary[];
}

export interface BucketListItemDto {
  id: string;
  mediaId: string | null;
  mediaType: MediaType;
  position: number;
  watched: boolean;
  watchedAt: string | null;
  note: string | null;
  addedAt: string;
  media: MediaSummary;
}

export interface BucketListDto {
  id: string;
  name: string;
  description: string;
  source: CollectionSource;
  seedQuery: string | null;
  accent: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  watchedCount: number;
  items?: BucketListItemDto[];
  preview?: MediaSummary[];
}

export interface PreferencesDto {
  personalizationEnabled: boolean;
  favoriteMusicGenres: string[];
  favoriteVideoGenres: string[];
  favoriteMoods: string[];
  avoidedGenres: string[];
  languages: string[];
  maxRuntimeMinutes: number | null;
  familyFriendlyOnly: boolean;
  preferredTone: string | null;
  /** Top learned affinities, highest first — shown read-only in the profile. */
  learned: Array<{ key: string; label: string; score: number }>;
  updatedAt: string;
}

export interface SearchHistoryDto {
  id: string;
  domain: Domain;
  query: string;
  resultCount: number;
  createdAt: string;
}

export interface CategoryDto {
  slug: string;
  label: string;
  description: string;
  /** The natural-language query this category runs. */
  query: string;
  kind: "genre" | "mood" | "activity" | "chart";
  accent: string;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantReply {
  message: string;
  steps: DiscoveryStep[];
  results: ScoredMedia[];
  domain: Domain | "BOTH";
  degraded: boolean;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };
