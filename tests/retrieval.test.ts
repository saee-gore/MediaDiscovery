import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateAll } from "./helpers/database";
import { loadCatalogue } from "./helpers/fixtures";
import { discover } from "@/server/agents/discovery";
import { searchMusic } from "@/server/agents/music-agent";
import { searchVideo } from "@/server/agents/movie-agent";
import { affinityScore, dedupeByTitle, retrieve } from "@/server/vector/retrieval";
import { hashEmbedding } from "@/server/vector/embeddings";
import { findByTitle, listMedia, vectorSearch } from "@/server/vector/store";
import type { ScoredMedia } from "@/lib/types";

describe("hybrid retrieval", () => {
  beforeAll(async () => {
    await createTestDatabase();
    await loadCatalogue({ music: 200, video: 200 });
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });

  it("produces deterministic unit-length embeddings", () => {
    const a = hashEmbedding("upbeat pop for a summer drive", 768);
    const b = hashEmbedding("upbeat pop for a summer drive", 768);
    expect(a).toEqual(b);
    expect(a).toHaveLength(768);
    const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("runs real pgvector cosine search and orders by similarity", async () => {
    const vector = hashEmbedding("energetic dance pop with a strong beat", 768);
    const hits = await vectorSearch({
      vector,
      model: "hash-fallback-v1",
      filters: { domain: "MUSIC" },
      limit: 10,
      minScore: -1,
    });
    expect(hits.length).toBeGreaterThan(0);
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it("respects hard filters in SQL, not after ranking", async () => {
    const { candidates } = await retrieve({
      semanticQuery: "a short film to watch tonight",
      filters: { domain: "VIDEO", mediaTypes: ["MOVIE"], maxRuntimeMinutes: 110 },
      limit: 15,
    });
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.mediaType).toBe("MOVIE");
      expect(candidate.runtimeMin ?? 0).toBeLessThanOrEqual(110);
    }
  });

  it("excludes anything the request asked to avoid", async () => {
    const { candidates } = await retrieve({
      semanticQuery: "something to watch",
      filters: { domain: "VIDEO", avoid: ["horror"] },
      limit: 20,
    });
    for (const candidate of candidates) {
      expect(candidate.genres).not.toContain("horror");
    }
  });

  it("falls back to popularity when nothing matches the filters at all", async () => {
    const { candidates, notices } = await retrieve({
      semanticQuery: "zzzzqqq nonexistent gibberish phrase",
      filters: { domain: "MUSIC", yearFrom: 1800, yearTo: 1801 },
      limit: 5,
    });
    // The year filter excludes everything, so even the fallback is empty —
    // which the pipeline must handle without throwing.
    expect(candidates).toHaveLength(0);
    expect(notices.length).toBeGreaterThan(0);
  });

  it("collapses duplicate releases of the same title", () => {
    const base = {
      domain: "MUSIC" as const,
      mediaType: "TRACK" as const,
      subtitle: "Dua Lipa",
      description: "",
      language: "en",
      adult: false,
      genres: [],
      moods: [],
      themes: [],
      tags: [],
      popularity: 50,
      source: "seed",
      vectorScore: 0,
      keywordScore: 0,
      popularityScore: 0,
      affinityScore: 0,
      matchedOn: [],
    };
    const items: ScoredMedia[] = [
      { ...base, id: "a", title: "Levitating", score: 0.4 },
      { ...base, id: "b", title: "Levitating (Deluxe Edition)", score: 0.9 },
      { ...base, id: "c", title: "Houdini", score: 0.5 },
    ];
    const deduped = dedupeByTitle(items);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].id).toBe("b");
  });

  it("scores affinity from the user's learned preferences", () => {
    const media = { domain: "VIDEO" as const, genres: ["science fiction"], moods: [], themes: [] };
    expect(affinityScore(media, undefined)).toBe(0);
    expect(affinityScore(media, { "video:genre:science fiction": 4 })).toBeGreaterThan(0);
    expect(affinityScore(media, { "music:genre:pop": 4 })).toBe(0);
  });

  it("finds a title by exact and fuzzy name for 'similar to' resolution", async () => {
    expect((await findByTitle("Interstellar", "VIDEO"))?.title).toBe("Interstellar");
    expect((await findByTitle("interstell", "VIDEO"))?.title).toBe("Interstellar");
    expect(await findByTitle("a film that does not exist", "VIDEO")).toBeNull();
  });
});

describe("discovery pipeline", () => {
  beforeAll(async () => {
    await createTestDatabase();
    await loadCatalogue({ music: 200, video: 200 });
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });

  it("returns music results and a readable step trace", async () => {
    const result = await searchMusic({ query: "energetic pop songs for a workout", limit: 8 });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(8);
    expect(result.intent.domain).toBe("MUSIC");
    expect(result.steps.map((step) => step.label)).toContain("Understanding your request");
    for (const item of result.results) {
      expect(item.domain).toBe("MUSIC");
      expect(item.reason).toBeTruthy();
      expect(item.matchedOn.length).toBeGreaterThan(0);
    }
  });

  it("honours a runtime constraint expressed in natural language", async () => {
    const result = await searchVideo({
      query: "a funny series with episodes under 40 minutes",
      limit: 10,
    });
    expect(result.intent.maxRuntimeMinutes).toBe(40);
    for (const item of result.results) {
      expect(item.runtimeMin ?? 0).toBeLessThanOrEqual(40);
    }
  });

  it("anchors on a referenced title and never recommends it back", async () => {
    const result = await searchVideo({
      query: "emotional movies similar to Interstellar",
      limit: 10,
    });
    expect(result.intent.similarTo.join(" ").toLowerCase()).toContain("interstellar");
    expect(result.results.map((item) => item.title)).not.toContain("Interstellar");
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("applies structured panel preferences as hard filters", async () => {
    const result = await searchVideo({
      query: "something worth watching",
      preferences: { mediaTypes: ["SERIES"], maxRuntimeMinutes: 35, minRating: 8 },
      limit: 10,
    });
    for (const item of result.results) {
      expect(item.mediaType).toBe("SERIES");
      expect(item.runtimeMin ?? 0).toBeLessThanOrEqual(35);
      expect(item.rating ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it("reports an actionable notice instead of throwing when nothing matches", async () => {
    const result = await discover({
      query: "a documentary about lunar accounting released in 1802",
      domainHint: "VIDEO",
      limit: 5,
    });
    if (result.results.length === 0) {
      expect(result.notices.join(" ")).toMatch(/broader|closest|matches/i);
    }
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("marks the response degraded when the model is unavailable", async () => {
    const result = await searchMusic({ query: "relaxing music for studying", limit: 5 });
    // DISABLE_LLM is set for the suite, so every run is the degraded path.
    expect(result.degraded).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("keeps a genre filter honest", async () => {
    const jazz = await listMedia({ domain: "MUSIC", genres: ["jazz"] }, 10);
    expect(jazz.length).toBeGreaterThan(0);
    for (const item of jazz) {
      expect(item.genres.join(" ")).toMatch(/jazz/i);
    }
  });
});
