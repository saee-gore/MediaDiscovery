/**
 * Query understanding agent.
 *
 * Turns "I want a short mystery series I can finish over a weekend" into a
 * structured intent the retrieval layer can act on. The LLM does the reading;
 * Zod does the trusting. If the model is unreachable or returns something
 * unusable, a deterministic heuristic parser takes over so search never simply
 * stops working — it just gets blunter, and says so.
 */
import { z } from "zod";

import type { Domain, MediaType, SearchIntent } from "@/lib/types";
import { llmAvailable } from "@/server/ai/ollama";
import { callStructured } from "@/server/ai/structured";
import { logger } from "@/server/lib/logger";

const intentSchema = z.object({
  intent: z
    .enum(["music_recommendation", "music_search", "video_recommendation", "video_search", "mixed"])
    .default("mixed"),
  domain: z.enum(["MUSIC", "VIDEO", "BOTH"]).default("BOTH"),
  semanticQuery: z.string().min(1).max(400),
  keywords: z.array(z.string()).max(12).default([]),
  genres: z.array(z.string()).max(8).default([]),
  moods: z.array(z.string()).max(8).default([]),
  themes: z.array(z.string()).max(8).default([]),
  similarTo: z.array(z.string()).max(6).default([]),
  mediaTypes: z.array(z.enum(["TRACK", "MOVIE", "SERIES"])).max(3).default([]),
  languages: z.array(z.string()).max(4).default([]),
  useCase: z.string().max(60).nullish(),
  tone: z.enum(["light", "balanced", "serious", "dark"]).nullish(),
  pacing: z.enum(["slow", "moderate", "brisk", "relentless"]).nullish(),
  energy: z.enum(["low", "medium", "high"]).nullish(),
  yearFrom: z.number().int().min(1900).max(2100).nullish(),
  yearTo: z.number().int().min(1900).max(2100).nullish(),
  releasePeriod: z.enum(["recent", "this_year", "classic", "any"]).nullish(),
  maxRuntimeMinutes: z.number().int().min(1).max(1000).nullish(),
  minRating: z.number().min(0).max(10).nullish(),
  familyFriendly: z.boolean().nullish(),
  avoid: z.array(z.string()).max(8).default([]),
  limit: z.number().int().min(1).max(50).nullish(),
});

const SHAPE = `{
  "intent": "music_recommendation" | "music_search" | "video_recommendation" | "video_search" | "mixed",
  "domain": "MUSIC" | "VIDEO" | "BOTH",
  "semanticQuery": "a descriptive sentence capturing the feel of what they want",
  "keywords": ["literal names, artists or titles mentioned"],
  "genres": ["pop"], "moods": ["energetic"], "themes": ["summer"],
  "similarTo": ["artist or title they referenced"],
  "mediaTypes": ["TRACK" | "MOVIE" | "SERIES"],
  "languages": ["en"],
  "useCase": "workout" | "study" | "date night" | null,
  "tone": "light" | "balanced" | "serious" | "dark" | null,
  "pacing": "slow" | "moderate" | "brisk" | "relentless" | null,
  "energy": "low" | "medium" | "high" | null,
  "yearFrom": null, "yearTo": null,
  "releasePeriod": "recent" | "this_year" | "classic" | "any" | null,
  "maxRuntimeMinutes": null, "minRating": null, "familyFriendly": null,
  "avoid": ["things they explicitly do not want"],
  "limit": null
}`;

const SYSTEM = `You extract structured search preferences from a person's natural-language request for music, films or television.

Rules:
- Only record what the request actually implies. Use null or an empty array otherwise; do not invent constraints.
- "semanticQuery" should read like a description of the desired item, not a command. Strip filter words ("show me", "find", "top 10") and keep the feel.
- Put artist names, film titles and series titles a person references in BOTH "keywords" and "similarTo".
- "avoid" captures explicit negatives: "not too violent" -> ["violence"], "nothing depressing" -> ["depressing"].
- A request about songs, artists, albums or playlists is MUSIC. A request about films, series, shows or watching is VIDEO. If genuinely ambiguous, BOTH.
- Never suggest titles. You are only parsing the request.`;

export interface ParseOptions {
  /** Constrain the parse when the user is already inside a section of the app. */
  domainHint?: Domain | "BOTH";
  limit?: number;
}

export async function parseQuery(query: string, options: ParseOptions = {}): Promise<SearchIntent> {
  const trimmed = query.trim();
  if (!trimmed) return heuristicParse("", options);

  if (!(await llmAvailable())) {
    return { ...heuristicParse(trimmed, options), degraded: true };
  }

  try {
    const parsed = await callStructured({
      name: "query-parser",
      system: SYSTEM,
      shape: SHAPE,
      schema: intentSchema,
      user: options.domainHint && options.domainHint !== "BOTH"
        ? `Request: ${trimmed}\n\n(The person is browsing the ${options.domainHint === "MUSIC" ? "music" : "film and television"} section, so prefer that domain.)`
        : `Request: ${trimmed}`,
    });

    const heuristic = heuristicParse(trimmed, options);
    // Union the two: the LLM is better at nuance, the heuristics are better at
    // hard constraints like "under 40 minutes" that models often drop.
    return finalise(
      {
        ...parsed,
        semanticQuery: parsed.semanticQuery || heuristic.semanticQuery,
        genres: union(parsed.genres, heuristic.genres),
        moods: union(parsed.moods, heuristic.moods),
        themes: union(parsed.themes, heuristic.themes),
        keywords: union(parsed.keywords, heuristic.keywords),
        similarTo: union(parsed.similarTo, heuristic.similarTo),
        avoid: union(parsed.avoid, heuristic.avoid),
        maxRuntimeMinutes: parsed.maxRuntimeMinutes ?? heuristic.maxRuntimeMinutes,
        familyFriendly: parsed.familyFriendly ?? heuristic.familyFriendly,
        releasePeriod: parsed.releasePeriod ?? heuristic.releasePeriod,
        energy: parsed.energy ?? heuristic.energy,
        useCase: parsed.useCase ?? heuristic.useCase,
        limit: options.limit ?? parsed.limit ?? heuristic.limit,
        mediaTypes: parsed.mediaTypes.length ? parsed.mediaTypes : heuristic.mediaTypes,
        domain: options.domainHint && options.domainHint !== "BOTH" ? options.domainHint : parsed.domain,
      },
      false,
    );
  } catch (error) {
    logger.warn("query parser fell back to heuristics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...heuristicParse(trimmed, options), degraded: true };
  }
}

const union = (a: string[] = [], b: string[] = []): string[] => [
  ...new Set([...a, ...b].map((value) => value.trim()).filter(Boolean)),
];

function finalise(intent: z.infer<typeof intentSchema>, degraded: boolean): SearchIntent {
  const year = new Date().getFullYear();
  let yearFrom = intent.yearFrom ?? null;
  let yearTo = intent.yearTo ?? null;
  switch (intent.releasePeriod) {
    case "recent":
      yearFrom = yearFrom ?? year - 3;
      break;
    case "this_year":
      yearFrom = yearFrom ?? year;
      break;
    case "classic":
      yearTo = yearTo ?? 2000;
      break;
    default:
      break;
  }

  const mediaTypes: MediaType[] = intent.mediaTypes.length
    ? intent.mediaTypes
    : intent.domain === "MUSIC"
      ? ["TRACK"]
      : intent.domain === "VIDEO"
        ? ["MOVIE", "SERIES"]
        : [];

  return {
    intent: intent.intent,
    domain: intent.domain,
    semanticQuery: intent.semanticQuery,
    keywords: intent.keywords,
    genres: intent.genres.map((g) => g.toLowerCase()),
    moods: intent.moods.map((m) => m.toLowerCase()),
    themes: intent.themes.map((t) => t.toLowerCase()),
    similarTo: intent.similarTo,
    mediaTypes,
    languages: intent.languages.map((l) => l.toLowerCase()),
    useCase: intent.useCase ?? null,
    tone: intent.tone ?? null,
    pacing: intent.pacing ?? null,
    energy: intent.energy ?? null,
    yearFrom,
    yearTo,
    releasePeriod: intent.releasePeriod ?? null,
    maxRuntimeMinutes: intent.maxRuntimeMinutes ?? null,
    minRating: intent.minRating ?? null,
    familyFriendly: intent.familyFriendly ?? null,
    avoid: intent.avoid.map((a) => a.toLowerCase()),
    limit: intent.limit ?? null,
    degraded,
  };
}

// ---------------------------------------------------------------------------
// Deterministic fallback parser
// ---------------------------------------------------------------------------

const MUSIC_GENRES = [
  "pop", "rock", "hip-hop", "hip hop", "rap", "r&b", "rnb", "indie", "electronic", "edm",
  "house", "techno", "jazz", "classical", "country", "latin", "reggaeton", "k-pop", "kpop",
  "bollywood", "afrobeats", "soul", "funk", "disco", "folk", "metal", "punk", "ambient",
];

const VIDEO_GENRES = [
  "sci-fi", "science fiction", "thriller", "mystery", "crime", "drama", "comedy", "romance",
  "romcom", "horror", "documentary", "animation", "action", "adventure", "fantasy", "history",
  "war", "musical", "western", "biopic", "psychological thriller",
];

const MOODS = [
  "upbeat", "energetic", "relaxing", "relaxed", "calm", "chill", "sad", "happy", "emotional",
  "dark", "light", "light-hearted", "lighthearted", "funny", "romantic", "nostalgic", "moody",
  "intense", "gentle", "comforting", "uplifting", "melancholy", "atmospheric", "cosy", "cozy",
  "smart", "intelligent", "suspenseful", "tense", "wholesome", "beautiful", "epic",
];

const MUSIC_HINTS = /\b(song|songs|track|tracks|music|playlist|artist|album|band|singer|bpm|listen|beats?)\b/i;
const VIDEO_HINTS = /\b(movie|movies|film|films|series|show|shows|season|seasons|episode|episodes|watch|watching|binge|documentary|tv)\b/i;
const SERIES_HINTS = /\b(series|show|shows|season|seasons|episode|episodes|binge)\b/i;
const MOVIE_HINTS = /\b(movie|movies|film|films)\b/i;

const USE_CASES: Array<[RegExp, string]> = [
  [/\bworkout|gym|running|exercise|training\b/i, "workout"],
  [/\bstudy|studying|focus|concentrat|deep work\b/i, "focus"],
  [/\bsleep|sleeping|bedtime|insomnia\b/i, "sleep"],
  [/\bparty|dancing|dancefloor|night out\b/i, "party"],
  [/\bdate night|date-night\b/i, "date night"],
  [/\bdriv(e|ing)|road trip\b/i, "driving"],
  [/\bafter work|unwind|wind down|stressful day\b/i, "comfort"],
  [/\bweekend\b/i, "weekend binge"],
  [/\bwith (friends|a group|the family)\b/i, "group watching"],
];

export function heuristicParse(query: string, options: ParseOptions = {}): SearchIntent {
  const text = query.toLowerCase();
  const year = new Date().getFullYear();

  const musicScore = (text.match(MUSIC_HINTS) ?? []).length;
  const videoScore = (text.match(VIDEO_HINTS) ?? []).length;
  let domain: Domain | "BOTH" =
    options.domainHint && options.domainHint !== "BOTH"
      ? options.domainHint
      : musicScore > videoScore
        ? "MUSIC"
        : videoScore > musicScore
          ? "VIDEO"
          : "BOTH";

  const genrePool = domain === "MUSIC" ? MUSIC_GENRES : domain === "VIDEO" ? VIDEO_GENRES : [...MUSIC_GENRES, ...VIDEO_GENRES];
  const genres = genrePool.filter((genre) => text.includes(genre));
  if (genres.length && domain === "BOTH") {
    domain = MUSIC_GENRES.includes(genres[0]) ? "MUSIC" : "VIDEO";
  }

  const moods = MOODS.filter((mood) => text.includes(mood));

  // "similar to X", "like X and Y", "similar to X but ..."
  const similarTo: string[] = [];
  const similarMatch = text.match(/(?:similar to|like|reminds me of|in the style of)\s+([^.?!]+)/i);
  if (similarMatch) {
    const segment = similarMatch[1]
      .split(/\bbut\b|\bwith\b|\bfor\b|\bthat\b|\bwhich\b/)[0]
      .split(/\band\b|,|\bor\b/)
      .map((part) => part.trim())
      .filter((part) => part.length > 2 && part.length < 60);
    similarTo.push(...segment.slice(0, 4));
  }

  const mediaTypes: MediaType[] = [];
  if (domain === "MUSIC") mediaTypes.push("TRACK");
  else if (domain === "VIDEO") {
    if (SERIES_HINTS.test(text) && !MOVIE_HINTS.test(text)) mediaTypes.push("SERIES");
    else if (MOVIE_HINTS.test(text) && !SERIES_HINTS.test(text)) mediaTypes.push("MOVIE");
    else mediaTypes.push("MOVIE", "SERIES");
  }

  let maxRuntimeMinutes: number | null = null;
  const runtimeMatch = text.match(/(?:under|less than|shorter than|below)\s+(\d{1,3})\s*(?:min|minute|minutes)/);
  if (runtimeMatch) maxRuntimeMinutes = Number(runtimeMatch[1]);
  else if (/\b(short|quick)\b/.test(text) && domain === "VIDEO") maxRuntimeMinutes = 110;
  const hourMatch = text.match(/(?:under|less than)\s+(\d)\s*(?:hour|hours|hrs?)/);
  if (hourMatch) maxRuntimeMinutes = Number(hourMatch[1]) * 60;

  let releasePeriod: SearchIntent["releasePeriod"] = null;
  if (/\b(recent|recently|new|latest|this month|nowadays)\b/.test(text)) releasePeriod = "recent";
  if (/\bthis year\b/.test(text)) releasePeriod = "this_year";
  if (/\b(classic|old|vintage|retro|90s|80s|70s)\b/.test(text)) releasePeriod = "classic";

  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  // "1990s" and the far more common bare "90s". Two-digit decades below 30 are
  // read as this century (00s/10s/20s), the rest as the last one.
  const decade = text.match(/\b(?:(19|20)(\d)0s|(\d)0s)\b/);
  if (decade) {
    const start = decade[1]
      ? Number(`${decade[1]}${decade[2]}0`)
      : Number(decade[3]) <= 2
        ? 2000 + Number(decade[3]) * 10
        : 1900 + Number(decade[3]) * 10;
    yearFrom = start;
    yearTo = start + 9;
  }
  const explicitYear = text.match(/\b(19|20)\d{2}\b/);
  if (explicitYear && !decade) {
    yearFrom = Number(explicitYear[0]);
    yearTo = Number(explicitYear[0]);
  }

  let energy: SearchIntent["energy"] = null;
  if (/\b(energetic|high energy|upbeat|pumping|intense|hype)\b/.test(text)) energy = "high";
  else if (/\b(calm|relaxing|chill|mellow|quiet|gentle|soft)\b/.test(text)) energy = "low";

  let tone: SearchIntent["tone"] = null;
  if (/\b(dark|bleak|grim|disturbing)\b/.test(text)) tone = "dark";
  else if (/\b(light|light-hearted|lighthearted|fun|comforting|cosy|cozy|feel-good)\b/.test(text)) tone = "light";
  else if (/\b(serious|thoughtful|profound)\b/.test(text)) tone = "serious";

  const useCase = USE_CASES.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  const avoid: string[] = [];
  const negation = text.match(/\b(?:not too|nothing too|without too much|no|not)\s+([a-z\s-]{3,30})/g);
  for (const match of negation ?? []) {
    const cleaned = match
      .replace(/\b(?:not too|nothing too|without too much|no|not)\s+/, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" ");
    if (cleaned && cleaned.length > 2) avoid.push(cleaned);
  }

  const familyFriendly = /\b(family|kids|children|family-friendly|with my (kids|children|parents))\b/.test(text)
    ? true
    : null;

  const limitMatch = text.match(/\b(?:top|best|give me|show me)\s+(\d{1,2})\b/);
  const limit = options.limit ?? (limitMatch ? Number(limitMatch[1]) : null);

  const semanticQuery =
    query
      .replace(/^(show me|find me|find|give me|i want|i need|recommend|suggest|looking for)\s+/i, "")
      .trim() || query.trim();

  const keywords = [
    ...similarTo,
    ...query
      .split(/\s+/)
      .filter((word) => /^[A-Z][a-zA-Z']{2,}$/.test(word))
      .slice(0, 6),
  ];

  return finalise(
    {
      intent:
        domain === "MUSIC"
          ? similarTo.length || moods.length
            ? "music_recommendation"
            : "music_search"
          : domain === "VIDEO"
            ? similarTo.length || moods.length
              ? "video_recommendation"
              : "video_search"
            : "mixed",
      domain,
      semanticQuery,
      keywords: [...new Set(keywords)],
      genres,
      moods,
      themes: [],
      similarTo,
      mediaTypes,
      languages: [],
      useCase,
      tone,
      pacing: null,
      energy,
      yearFrom,
      yearTo: yearTo ?? (releasePeriod === "classic" ? 2000 : null),
      releasePeriod,
      maxRuntimeMinutes,
      minRating: /\b(acclaimed|award|highly rated|best rated|critically)\b/.test(text) ? 7.5 : null,
      familyFriendly,
      avoid,
      limit,
    },
    true,
  );
}

export { intentSchema };
