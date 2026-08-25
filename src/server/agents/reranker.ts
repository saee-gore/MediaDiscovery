/**
 * Reranking + explanation agent.
 *
 * The retrieval layer decides *what is plausible*; this decides *what is best*
 * and says why. Two guarantees matter here:
 *
 *   1. The model may only reorder ids it was given. Any id it invents is
 *      discarded — this is the safeguard against LLM-hallucinated titles.
 *   2. Failure is non-fatal. If the model is down or its output is unusable,
 *      the retrieval ordering stands and each item gets a deterministic
 *      explanation built from the metadata that actually matched.
 */
import { z } from "zod";

import type { ScoredMedia, SearchIntent } from "@/lib/types";
import { llmAvailable } from "@/server/ai/ollama";
import { callStructured } from "@/server/ai/structured";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/lib/logger";

const rerankSchema = z.object({
  summary: z.string().max(400).default(""),
  ranked: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().min(0).max(1).default(0.5),
        reason: z.string().max(300).default(""),
      }),
    )
    .max(60)
    .default([]),
});

const SHAPE = `{
  "summary": "one or two sentences explaining what these picks have in common",
  "ranked": [{ "id": "<exact id from the candidate list>", "score": 0.0-1.0, "reason": "one sentence, specific to this item" }]
}`;

const SYSTEM = `You are ranking candidate media that has already been retrieved from a verified catalogue.

Rules:
- Use ONLY the ids given to you. Never invent an id, a title or an artist.
- Rank by how well each candidate satisfies the person's request, not by general fame.
- Drop candidates that clearly do not fit rather than ranking them low.
- Each "reason" must cite something concrete from that candidate's own metadata (its genre, mood, tone, runtime, themes or artist) and explain the connection to the request. No generic praise.
- The "summary" describes the set as a whole in the second person ("These picks lean...").
- Keep every string short. No markdown, no lists inside strings.`;

export interface RerankResult {
  items: ScoredMedia[];
  summary: string;
  reranked: boolean;
}

function candidateLine(item: ScoredMedia): string {
  const parts = [
    `id=${item.id}`,
    `title=${item.title}`,
    item.subtitle ? `by=${item.subtitle}` : "",
    item.mediaType === "SERIES"
      ? `series ${item.seasons ?? "?"} seasons / ${item.episodes ?? "?"} eps / ~${item.runtimeMin ?? "?"}min`
      : item.mediaType === "MOVIE"
        ? `film ${item.runtimeMin ?? "?"}min`
        : "track",
    item.releaseYear ? `year=${item.releaseYear}` : "",
    item.genres.length ? `genres=${item.genres.slice(0, 4).join("/")}` : "",
    item.moods.length ? `mood=${item.moods.slice(0, 4).join("/")}` : "",
    item.themes.length ? `themes=${item.themes.slice(0, 4).join("/")}` : "",
    item.tone ? `tone=${item.tone}` : "",
    item.pacing ? `pacing=${item.pacing}` : "",
    item.intensity ? `intensity=${item.intensity}` : "",
    item.energy != null ? `energy=${item.energy.toFixed(2)}` : "",
    item.rating != null ? `rating=${item.rating.toFixed(1)}` : "",
  ].filter(Boolean);
  return `- ${parts.join(" | ")}`;
}

function intentLine(intent: SearchIntent): string {
  const parts = [
    `wants: ${intent.semanticQuery}`,
    intent.genres.length ? `genres: ${intent.genres.join(", ")}` : "",
    intent.moods.length ? `moods: ${intent.moods.join(", ")}` : "",
    intent.similarTo.length ? `similar to: ${intent.similarTo.join(", ")}` : "",
    intent.useCase ? `use case: ${intent.useCase}` : "",
    intent.tone ? `tone: ${intent.tone}` : "",
    intent.energy ? `energy: ${intent.energy}` : "",
    intent.maxRuntimeMinutes ? `max runtime: ${intent.maxRuntimeMinutes} min` : "",
    intent.avoid.length ? `avoid: ${intent.avoid.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

export async function rerank(
  query: string,
  intent: SearchIntent,
  candidates: ScoredMedia[],
  limit: number,
): Promise<RerankResult> {
  if (candidates.length === 0) {
    return { items: [], summary: "", reranked: false };
  }

  const env = getEnv();
  const pool = candidates.slice(0, env.RERANK_CANDIDATES);

  if (!(await llmAvailable())) {
    return deterministic(pool, intent, limit);
  }

  try {
    const parsed = await callStructured({
      name: "reranker",
      system: SYSTEM,
      shape: SHAPE,
      schema: rerankSchema,
      user: [
        `Request: "${query}"`,
        "",
        intentLine(intent),
        "",
        `Candidates (${pool.length}):`,
        pool.map(candidateLine).join("\n"),
        "",
        `Return at most ${limit} ranked items, best first.`,
      ].join("\n"),
    });

    const byId = new Map(pool.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const items: ScoredMedia[] = [];

    for (const entry of parsed.ranked) {
      const item = byId.get(entry.id);
      if (!item || seen.has(entry.id)) continue; // hallucinated or duplicated id
      seen.add(entry.id);
      items.push({
        ...item,
        // Blend so retrieval evidence still counts; the model refines, not replaces.
        score: item.score * 0.4 + entry.score * 0.6,
        reason: entry.reason || describeMatch(item, intent),
        matchedOn: [...new Set([...item.matchedOn, "AI reranking"])],
      });
      if (items.length >= limit) break;
    }

    const dropped = parsed.ranked.length - seen.size;
    if (dropped > 0) {
      logger.warn("reranker returned unknown ids; discarded", { dropped });
    }

    if (items.length === 0) return deterministic(pool, intent, limit);

    // Backfill from retrieval order if the model returned fewer than asked.
    if (items.length < Math.min(limit, pool.length)) {
      for (const item of pool) {
        if (items.length >= limit) break;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push({ ...item, reason: describeMatch(item, intent) });
      }
    }

    return {
      items: items.map((item, index) => ({ ...item, rank: index + 1 })),
      summary: parsed.summary || defaultSummary(items, intent),
      reranked: true,
    };
  } catch (error) {
    logger.warn("reranking failed; keeping retrieval order", {
      error: error instanceof Error ? error.message : String(error),
    });
    return deterministic(pool, intent, limit);
  }
}

function deterministic(
  candidates: ScoredMedia[],
  intent: SearchIntent,
  limit: number,
): RerankResult {
  const items = candidates.slice(0, limit).map((item, index) => ({
    ...item,
    rank: index + 1,
    reason: describeMatch(item, intent),
  }));
  return { items, summary: defaultSummary(items, intent), reranked: false };
}

/**
 * Explanation without a model: state the overlap between the request and the
 * item's own metadata. Less fluent than the LLM, equally honest.
 */
export function describeMatch(item: ScoredMedia, intent: SearchIntent): string {
  const reasons: string[] = [];

  const genreOverlap = item.genres.filter((genre) =>
    intent.genres.some((wanted) => genre.includes(wanted) || wanted.includes(genre)),
  );
  if (genreOverlap.length) reasons.push(`it's ${genreOverlap.slice(0, 2).join(" / ")}`);

  const moodOverlap = [...item.moods, ...item.tags].filter((mood) =>
    intent.moods.some((wanted) => mood.includes(wanted) || wanted.includes(mood)),
  );
  if (moodOverlap.length) reasons.push(`the mood reads ${moodOverlap.slice(0, 2).join(" and ")}`);

  if (intent.useCase && item.tags.some((tag) => tag.includes(intent.useCase!.toLowerCase()))) {
    reasons.push(`it's tagged for ${intent.useCase}`);
  }
  if (intent.maxRuntimeMinutes && item.runtimeMin && item.runtimeMin <= intent.maxRuntimeMinutes) {
    reasons.push(`it runs ${item.runtimeMin} minutes`);
  }
  if (intent.tone && item.tone === intent.tone) reasons.push(`the tone is ${item.tone}`);
  if (intent.energy === "high" && (item.energy ?? 0) >= 0.7) reasons.push("the energy is high");
  if (intent.energy === "low" && (item.energy ?? 1) <= 0.4) reasons.push("it stays low-key");
  if (item.vectorScore > 0.5) reasons.push("it sits close to your description semantically");

  if (reasons.length === 0) {
    const descriptor = item.genres[0] ?? item.moods[0] ?? "catalogue";
    return `Closest ${descriptor} match in the catalogue for what you described.`;
  }
  const head = reasons.slice(0, 3).join(", ");
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.`;
}

function defaultSummary(items: ScoredMedia[], intent: SearchIntent): string {
  if (items.length === 0) return "";
  const genres = [...new Set(items.flatMap((item) => item.genres))].slice(0, 3);
  const moods = [...new Set(items.flatMap((item) => item.moods))].slice(0, 3);
  const bits: string[] = [];
  if (genres.length) bits.push(genres.join(", "));
  if (moods.length) bits.push(`leaning ${moods.join(", ")}`);
  const tail = bits.length ? `, mostly ${bits.join(", ")}.` : ".";
  return `${items.length} match${items.length === 1 ? "" : "es"} for "${intent.semanticQuery}"${tail}`;
}
