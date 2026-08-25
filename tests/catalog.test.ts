import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateAll } from "./helpers/database";
import { fakeTrack } from "./helpers/fixtures";
import { catalogueStats, generateMissingEmbeddings, upsertRecords } from "@/server/services/catalog";
import { seedTrackRecords, seedTitleRecords } from "@/server/providers/seed";
import { buildDocument, deriveMusicUseCases, deriveVideoDescriptors } from "@/server/media/enrich";
import { embeddingCoverage, findStaleEmbeddings } from "@/server/vector/store";

describe("catalogue ingestion and enrichment", () => {
  beforeAll(async () => {
    await createTestDatabase();
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });

  it("enriches a track document with derived moods and use cases", () => {
    const track = fakeTrack({ energy: 0.9, tempo: 150, valence: 0.9, danceability: 0.85 });
    const document = buildDocument(track);
    expect(document).toContain("Title: ");
    expect(document).toContain("Energy: high");
    expect(deriveMusicUseCases(track)).toContain("workout");
  });

  it("derives tone, pacing and intensity for video without provider help", () => {
    const descriptors = deriveVideoDescriptors({
      ...fakeTrack(),
      domain: "VIDEO",
      mediaType: "MOVIE",
      genres: ["horror", "thriller"],
      moods: [],
      tone: null,
      pacing: null,
      intensity: null,
    });
    expect(descriptors.tone).toBe("dark");
    expect(descriptors.intensity).toBe("high");
  });

  it("upserts records and reports inserted vs unchanged", async () => {
    await truncateAll();
    const records = [...seedTrackRecords().slice(0, 20), ...seedTitleRecords().slice(0, 15)];

    const first = await upsertRecords(records);
    expect(first.inserted).toBe(35);
    expect(first.unchanged).toBe(0);

    const second = await upsertRecords(records);
    expect(second.inserted).toBe(0);
    expect(second.unchanged).toBe(35);
    expect(second.ids).toHaveLength(0);
  });

  it("drops the embedding only when the document actually changes", async () => {
    await truncateAll();
    const track = fakeTrack({ id: "seed:track:hash-check" });
    await upsertRecords([track]);
    await generateMissingEmbeddings(10);

    const coverageBefore = await embeddingCoverage("hash-fallback-v1");
    expect(coverageBefore.embedded).toBe(1);

    // Same content -> embedding survives.
    await upsertRecords([track]);
    expect(await findStaleEmbeddings("hash-fallback-v1", 5)).toHaveLength(0);

    // Changed content -> embedding is invalidated and picked up again.
    await upsertRecords([{ ...track, description: "A completely different description." }]);
    expect(await findStaleEmbeddings("hash-fallback-v1", 5)).toHaveLength(1);

    const run = await generateMissingEmbeddings(10);
    expect(run.processed).toBe(1);
    expect((await embeddingCoverage("hash-fallback-v1")).embedded).toBe(1);
  });

  it("reports catalogue statistics by domain and source", async () => {
    await truncateAll();
    await upsertRecords([...seedTrackRecords().slice(0, 10), ...seedTitleRecords().slice(0, 6)]);
    const stats = await catalogueStats();
    expect(stats.total).toBe(16);
    expect(stats.music).toBe(10);
    expect(stats.video).toBe(6);
    expect(stats.sources.seed).toBe(16);
  });
});
