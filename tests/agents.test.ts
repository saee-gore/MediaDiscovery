import { describe, expect, it } from "vitest";

import { heuristicParse } from "@/server/agents/query-parser";
import { describeMatch, rerank } from "@/server/agents/reranker";
import { extractJson } from "@/server/ai/structured";
import { applyAffinity } from "@/server/services/preferences";
import type { ScoredMedia, SearchIntent } from "@/lib/types";

const intent = (overrides: Partial<SearchIntent> = {}): SearchIntent => ({
  intent: "video_recommendation",
  domain: "VIDEO",
  semanticQuery: "smart science fiction",
  keywords: [],
  genres: ["science fiction"],
  moods: ["thought-provoking"],
  themes: [],
  similarTo: [],
  mediaTypes: ["MOVIE"],
  languages: [],
  avoid: [],
  ...overrides,
});

const candidate = (id: string, overrides: Partial<ScoredMedia> = {}): ScoredMedia => ({
  id,
  domain: "VIDEO",
  mediaType: "MOVIE",
  title: `Title ${id}`,
  subtitle: "",
  description: "",
  language: "en",
  adult: false,
  popularity: 60,
  genres: ["science fiction"],
  moods: ["thought-provoking"],
  themes: [],
  tags: [],
  source: "seed",
  score: 0.5,
  vectorScore: 0.6,
  keywordScore: 0.2,
  popularityScore: 0.6,
  affinityScore: 0,
  matchedOn: ["semantic similarity"],
  ...overrides,
});

describe("query parser (heuristic path)", () => {
  it("routes music and video requests to the right domain", () => {
    expect(heuristicParse("upbeat pop songs for a summer drive").domain).toBe("MUSIC");
    expect(heuristicParse("a dark mystery series for the weekend").domain).toBe("VIDEO");
  });

  it("extracts genre, mood and use case", () => {
    const parsed = heuristicParse("energetic pop songs for a workout");
    expect(parsed.genres).toContain("pop");
    expect(parsed.moods).toContain("energetic");
    expect(parsed.useCase).toBe("workout");
    expect(parsed.energy).toBe("high");
  });

  it("reads a runtime ceiling out of natural language", () => {
    expect(heuristicParse("a funny series with episodes under 40 minutes").maxRuntimeMinutes).toBe(40);
    expect(heuristicParse("a film under 2 hours").maxRuntimeMinutes).toBe(120);
    expect(heuristicParse("a short mystery series").maxRuntimeMinutes).toBe(110);
  });

  it("captures reference titles for similarity search", () => {
    const parsed = heuristicParse("recommend emotional movies similar to Interstellar and Arrival");
    expect(parsed.similarTo.map((s) => s.toLowerCase())).toContain("interstellar");
    expect(parsed.similarTo.map((s) => s.toLowerCase())).toContain("arrival");
  });

  it("splits a reference from the constraint that follows it", () => {
    const parsed = heuristicParse("something like Interstellar but shorter and less intense");
    expect(parsed.similarTo[0].toLowerCase()).toContain("interstellar");
    expect(parsed.similarTo[0].toLowerCase()).not.toContain("shorter");
  });

  it("turns negatives into exclusions", () => {
    const parsed = heuristicParse("intelligent sci-fi with strong world-building but not too much violence");
    expect(parsed.avoid.join(" ")).toMatch(/violence/);
  });

  it("resolves relative time expressions to year bounds", () => {
    const year = new Date().getFullYear();
    expect(heuristicParse("recent pop songs").yearFrom).toBe(year - 3);
    expect(heuristicParse("classic rock").yearTo).toBe(2000);
    expect(heuristicParse("music from the 90s").yearFrom).toBe(1990);
    expect(heuristicParse("music from the 90s").yearTo).toBe(1999);
  });

  it("detects series vs film and family suitability", () => {
    expect(heuristicParse("a series to binge").mediaTypes).toEqual(["SERIES"]);
    expect(heuristicParse("a movie for tonight").mediaTypes).toEqual(["MOVIE"]);
    expect(heuristicParse("films to watch with my kids").familyFriendly).toBe(true);
  });

  it("always marks a heuristic parse as degraded", () => {
    expect(heuristicParse("anything").degraded).toBe(true);
  });
});

describe("structured output salvage", () => {
  it("extracts JSON from a markdown fence", () => {
    const raw = 'Sure!\n```json\n{"intent":"music_search","genres":["pop"]}\n```\nHope that helps.';
    expect(JSON.parse(extractJson(raw)!)).toEqual({ intent: "music_search", genres: ["pop"] });
  });

  it("stops at the matching brace and ignores trailing commentary", () => {
    const raw = '{"a": {"b": 1}} and then some words { that are not json';
    expect(JSON.parse(extractJson(raw)!)).toEqual({ a: { b: 1 } });
  });

  it("is not confused by braces inside strings", () => {
    const raw = '{"reason": "it has a } in it", "score": 1}';
    expect(JSON.parse(extractJson(raw)!)).toEqual({ reason: "it has a } in it", score: 1 });
  });

  it("returns null when there is no JSON at all", () => {
    expect(extractJson("I'm afraid I can't do that.")).toBeNull();
  });
});

describe("reranker", () => {
  it("falls back to retrieval order with metadata explanations when the LLM is off", async () => {
    const candidates = [candidate("a", { score: 0.9 }), candidate("b", { score: 0.5 })];
    const result = await rerank("smart sci-fi", intent(), candidates, 5);

    expect(result.reranked).toBe(false);
    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.items[0].reason).toBeTruthy();
    expect(result.items[0].rank).toBe(1);
    expect(result.summary).toContain("smart science fiction");
  });

  it("returns nothing for an empty candidate pool rather than inventing results", async () => {
    const result = await rerank("anything", intent(), [], 5);
    expect(result.items).toEqual([]);
    expect(result.summary).toBe("");
  });

  it("explains a match from the item's own metadata", () => {
    const reason = describeMatch(
      candidate("x", { runtimeMin: 95, tone: "dark", genres: ["science fiction"] }),
      intent({ maxRuntimeMinutes: 120, tone: "dark" }),
    );
    expect(reason).toMatch(/science fiction/);
    expect(reason).toMatch(/95 minutes/);
  });
});

describe("affinity learning", () => {
  const media = { domain: "VIDEO" as const, genres: ["science fiction"], moods: ["epic"], themes: ["space"] };

  it("increases on a save and decreases on a removal", () => {
    const saved = applyAffinity({}, media, "SAVED");
    expect(saved["video:genre:science fiction"]).toBeGreaterThan(0);

    const removed = applyAffinity(saved, media, "REMOVED");
    expect(removed["video:genre:science fiction"]).toBeLessThan(saved["video:genre:science fiction"]);
  });

  it("ignores actions that carry no preference signal", () => {
    expect(applyAffinity({}, media, "SHOWN")).toEqual({});
  });

  it("decays old signals and stays bounded under repetition", () => {
    let affinity: Record<string, number> = {};
    for (let i = 0; i < 200; i += 1) affinity = applyAffinity(affinity, media, "SAVED");
    expect(affinity["video:genre:science fiction"]).toBeLessThanOrEqual(12);

    const before = affinity["video:genre:science fiction"];
    const other = applyAffinity(affinity, { domain: "VIDEO" as const, genres: ["comedy"], moods: [], themes: [] }, "SAVED");
    expect(other["video:genre:science fiction"]).toBeLessThan(before);
  });

  it("keeps music and video affinities in separate namespaces", () => {
    const affinity = applyAffinity({}, { domain: "MUSIC" as const, genres: ["pop"], moods: [], themes: [] }, "SAVED");
    expect(affinity["music:genre:pop"]).toBeGreaterThan(0);
    expect(affinity["video:genre:pop"]).toBeUndefined();
  });
});
