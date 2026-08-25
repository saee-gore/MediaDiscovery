/**
 * Data enrichment.
 *
 * Raw provider metadata is a poor embedding target: "Levitating / Dua Lipa /
 * pop / 103bpm" has almost no semantic surface for a query like "something
 * upbeat for a summer drive". This module turns each record into a short
 * natural-language document that names the qualities a user actually asks
 * about — mood, energy, tone, pacing, use case — and derives those qualities
 * from whatever signals the provider does give us.
 */
import { createHash } from "node:crypto";

import type { MediaRecord } from "@/server/media/types";

// ---------------------------------------------------------------------------
// Music: audio features -> human descriptors
// ---------------------------------------------------------------------------

/** Spotify gives numbers; queries are phrased in adjectives. Bridge the two. */
export function deriveMusicMoods(record: MediaRecord): string[] {
  const moods = new Set(record.moods.map((m) => m.toLowerCase()));
  const { energy, valence, danceability, tempo, acousticness } = record;

  if (energy != null) {
    if (energy >= 0.75) moods.add("energetic");
    else if (energy <= 0.35) moods.add("calm");
  }
  if (valence != null) {
    if (valence >= 0.7) moods.add("upbeat");
    else if (valence <= 0.3) moods.add("melancholy");
  }
  if (danceability != null && danceability >= 0.7) moods.add("danceable");
  if (acousticness != null && acousticness >= 0.6) moods.add("acoustic");
  if (tempo != null) {
    if (tempo >= 140) moods.add("fast");
    else if (tempo <= 80) moods.add("slow");
  }
  return [...moods];
}

/** Use-case tags ("workout", "focus") are what people actually search by. */
export function deriveMusicUseCases(record: MediaRecord): string[] {
  const tags = new Set(record.tags.map((t) => t.toLowerCase()));
  const { energy = null, valence = null, danceability = null, tempo = null, acousticness = null } = record;
  const genres = record.genres.map((g) => g.toLowerCase());

  if ((energy ?? 0) >= 0.75 && (tempo ?? 0) >= 100) tags.add("workout");
  if ((danceability ?? 0) >= 0.7 && (energy ?? 0) >= 0.6) tags.add("party");
  if ((energy ?? 1) <= 0.4 && (acousticness ?? 0) >= 0.4) tags.add("chill");
  if ((energy ?? 1) <= 0.35 && (valence ?? 1) <= 0.45) tags.add("sleep");
  if (genres.some((g) => /classical|ambient|instrumental|neoclassical|jazz/.test(g)) && (energy ?? 1) <= 0.5) {
    tags.add("focus");
    tags.add("study");
  }
  if ((valence ?? 0) <= 0.3) tags.add("sad");
  if ((valence ?? 0) >= 0.75 && (energy ?? 0) >= 0.6) tags.add("feel-good");
  if (genres.some((g) => /romantic|soul|r&b/.test(g)) && (energy ?? 1) <= 0.6) tags.add("romantic");
  if ((energy ?? 0) >= 0.6 && (valence ?? 0) >= 0.6) tags.add("driving");
  return [...tags];
}

function energyWord(energy: number | null | undefined): string {
  if (energy == null) return "moderate";
  if (energy >= 0.75) return "high";
  if (energy >= 0.5) return "moderate";
  return "low";
}

// ---------------------------------------------------------------------------
// Video: genre/runtime/rating -> tone, pacing, emotional intensity
// ---------------------------------------------------------------------------

const DARK_GENRES = /horror|thriller|crime|war|noir|mystery/i;
const LIGHT_GENRES = /comedy|family|animation|romance|musical|reality/i;
const SLOW_GENRES = /drama|documentary|history|romance/i;
const FAST_GENRES = /action|adventure|comedy|thriller/i;

export function deriveVideoDescriptors(record: MediaRecord): {
  tone: string;
  pacing: string;
  intensity: string;
} {
  if (record.tone && record.pacing && record.intensity) {
    return { tone: record.tone, pacing: record.pacing, intensity: record.intensity };
  }
  const genreText = record.genres.join(" ");
  const moodText = record.moods.join(" ");
  const blob = `${genreText} ${moodText}`;

  let tone = record.tone ?? "balanced";
  if (!record.tone) {
    if (DARK_GENRES.test(blob)) tone = "dark";
    else if (LIGHT_GENRES.test(blob)) tone = "light";
    else tone = "serious";
  }

  let pacing = record.pacing ?? "moderate";
  if (!record.pacing) {
    if (FAST_GENRES.test(genreText)) pacing = "brisk";
    else if (SLOW_GENRES.test(genreText)) pacing = "slow";
    if ((record.runtimeMin ?? 0) > 150) pacing = "slow";
  }

  let intensity = record.intensity ?? "medium";
  if (!record.intensity) {
    if (/horror/i.test(genreText)) intensity = "high";
    else if (record.adult) intensity = "high";
    else if (LIGHT_GENRES.test(genreText)) intensity = "gentle";
    else if (DARK_GENRES.test(genreText)) intensity = "high";
    else intensity = "mild";
  }

  return { tone, pacing, intensity };
}

/** Viewing-context tags for video: "weekend binge", "date night", "comfort". */
export function deriveVideoTags(record: MediaRecord): string[] {
  const tags = new Set(record.tags.map((t) => t.toLowerCase()));
  const { tone, pacing, intensity } = deriveVideoDescriptors(record);
  const genres = record.genres.map((g) => g.toLowerCase()).join(" ");

  if (record.mediaType === "SERIES") {
    const episodes = record.episodes ?? 0;
    const runtime = record.runtimeMin ?? 45;
    const totalMinutes = episodes * runtime;
    if (episodes > 0 && episodes <= 10) tags.add("weekend binge");
    if (totalMinutes > 0 && totalMinutes <= 600) tags.add("short series");
    if (runtime <= 35) tags.add("short episodes");
    if ((record.seasons ?? 1) >= 5) tags.add("long haul");
  } else {
    if ((record.runtimeMin ?? 0) <= 105) tags.add("short film night");
    if ((record.runtimeMin ?? 0) >= 150) tags.add("long watch");
  }

  if (tone === "light" && intensity === "gentle") {
    tags.add("comfort");
    tags.add("easy watching");
  }
  if (/romance/.test(genres) && intensity !== "extreme") tags.add("date night");
  if (!record.adult && (tone === "light" || /family|animation/.test(genres))) tags.add("family friendly");
  if (/documentary|nature/.test(genres)) tags.add("background watching");
  if (pacing === "relentless") tags.add("gripping");
  if (intensity === "extreme") tags.add("heavy going");
  if ((record.rating ?? 0) >= 8.3) tags.add("acclaimed");
  return [...tags];
}

// ---------------------------------------------------------------------------
// Document construction
// ---------------------------------------------------------------------------

function line(label: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? `${label}: ${text}` : null;
}

function list(label: string, values: string[]): string | null {
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return unique.length ? `${label}: ${unique.join(", ")}` : null;
}

/**
 * Build the text that actually gets embedded. Structured labels give the
 * embedding model a consistent frame across the catalogue, and the closing
 * prose sentence gives it something to match loose, descriptive queries on.
 */
export function buildDocument(record: MediaRecord): string {
  if (record.domain === "MUSIC") {
    const moods = deriveMusicMoods(record);
    const useCases = deriveMusicUseCases(record);
    return [
      line("Title", record.title),
      line("Artist", record.subtitle),
      line("Album", record.album),
      line("Released", record.releaseYear),
      list("Genre", record.genres),
      list("Mood", moods),
      line("Energy", energyWord(record.energy)),
      record.tempo ? line("Tempo", `${Math.round(record.tempo)} bpm`) : null,
      record.danceability != null ? line("Danceability", record.danceability.toFixed(2)) : null,
      record.valence != null ? line("Emotional tone", record.valence >= 0.5 ? "positive" : "downbeat") : null,
      list("Themes", record.themes),
      list("Good for", useCases),
      line("Description", record.description),
    ]
      .filter(Boolean)
      .join("\n");
  }

  const { tone, pacing, intensity } = deriveVideoDescriptors(record);
  const tags = deriveVideoTags(record);
  const shape =
    record.mediaType === "SERIES"
      ? `${record.seasons ?? 1} season${(record.seasons ?? 1) === 1 ? "" : "s"}, ${record.episodes ?? "?"} episodes, about ${record.runtimeMin ?? 45} minutes each`
      : `${record.runtimeMin ?? "?"} minute film`;

  return [
    line("Title", record.title),
    line("Type", record.mediaType === "SERIES" ? "TV series" : "Film"),
    line("Released", record.releaseYear),
    line("Format", shape),
    list("Genre", record.genres),
    list("Mood", record.moods),
    line("Tone", tone),
    line("Pacing", pacing),
    line("Emotional intensity", intensity),
    list("Themes", record.themes),
    line("Language", record.language),
    record.rating != null ? line("Rating", `${record.rating.toFixed(1)}/10`) : null,
    list("Good for", tags),
    line("Description", record.description),
  ]
    .filter(Boolean)
    .join("\n");
}

export function hashDocument(document: string, model: string): string {
  return createHash("sha256").update(`${model}::${document}`).digest("hex");
}

/**
 * Fold derived descriptors back into the record so filters and facets can use
 * them, then attach the document and its hash.
 */
export function enrich(record: MediaRecord): MediaRecord & { document: string } {
  const enriched: MediaRecord = { ...record };
  if (record.domain === "MUSIC") {
    enriched.moods = deriveMusicMoods(record);
    enriched.tags = deriveMusicUseCases(record);
  } else {
    const descriptors = deriveVideoDescriptors(record);
    enriched.tone = descriptors.tone;
    enriched.pacing = descriptors.pacing;
    enriched.intensity = descriptors.intensity;
    enriched.tags = deriveVideoTags(record);
  }
  return { ...enriched, document: buildDocument(enriched) };
}
