import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateUserData } from "./helpers/database";
import { loadCatalogue, makeUser } from "./helpers/fixtures";
import { searchVideo } from "@/server/agents/movie-agent";
import {
  affinityFor,
  clearSearchHistory,
  deleteSearchHistoryEntry,
  getOrCreatePreferences,
  listSearchHistory,
  recordEvent,
  resetLearnedAffinity,
  resetPreferences,
  toPreferencesDto,
  updatePreferences,
} from "@/server/services/preferences";
import { listMedia } from "@/server/vector/store";
import type { MediaSummary } from "@/lib/types";
import type { User } from "@/server/db/schema";

let user: User;
let titles: MediaSummary[];

describe("preferences and personalisation", () => {
  beforeAll(async () => {
    await createTestDatabase();
    await loadCatalogue({ music: 40, video: 60 });
    titles = await listMedia({ domain: "VIDEO" }, 20);
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });
  beforeEach(async () => {
    await truncateUserData();
    user = await makeUser();
  });

  it("creates sensible defaults on first read", async () => {
    const preferences = await getOrCreatePreferences(user.id);
    expect(preferences.personalizationEnabled).toBe(true);
    expect(preferences.familyFriendlyOnly).toBe(false);
    expect(toPreferencesDto(preferences).learned).toEqual([]);
  });

  it("saves declared preferences and surfaces them in the DTO", async () => {
    const updated = await updatePreferences(user.id, {
      favoriteVideoGenres: ["science fiction", "drama"],
      avoidedGenres: ["horror"],
      maxRuntimeMinutes: 120,
      familyFriendlyOnly: true,
    });
    const dto = toPreferencesDto(updated);
    expect(dto.favoriteVideoGenres).toEqual(["science fiction", "drama"]);
    expect(dto.avoidedGenres).toEqual(["horror"]);
    expect(dto.maxRuntimeMinutes).toBe(120);
    expect(dto.familyFriendlyOnly).toBe(true);
  });

  it("applies declared preferences as filters during a search", async () => {
    await updatePreferences(user.id, { avoidedGenres: ["horror"], maxRuntimeMinutes: 110 });
    const result = await searchVideo({ query: "something to watch tonight", userId: user.id, limit: 12 });

    expect(result.results.length).toBeGreaterThan(0);
    for (const item of result.results) {
      expect(item.genres).not.toContain("horror");
      expect(item.runtimeMin ?? 0).toBeLessThanOrEqual(110);
    }
  });

  it("learns from saves and exposes what it learned", async () => {
    const sciFi = titles.find((title) => title.genres.includes("science fiction"))!;
    for (let i = 0; i < 3; i += 1) {
      await recordEvent({ userId: user.id, domain: "VIDEO", action: "SAVED", media: sciFi });
    }

    const affinity = await affinityFor(user.id);
    expect(Object.keys(affinity).some((key) => key.startsWith("video:genre:"))).toBe(true);

    const dto = toPreferencesDto(await getOrCreatePreferences(user.id));
    expect(dto.learned.length).toBeGreaterThan(0);
    expect(dto.learned[0].label).toMatch(/Film & TV/);
  });

  it("stops personalising the moment it is switched off", async () => {
    const sciFi = titles.find((title) => title.genres.includes("science fiction"))!;
    await recordEvent({ userId: user.id, domain: "VIDEO", action: "SAVED", media: sciFi });
    expect(Object.keys(await affinityFor(user.id)).length).toBeGreaterThan(0);

    await updatePreferences(user.id, { personalizationEnabled: false });
    expect(await affinityFor(user.id)).toEqual({});

    // And nothing new is learned while it is off.
    await recordEvent({ userId: user.id, domain: "VIDEO", action: "SAVED", media: titles[1] });
    await updatePreferences(user.id, { personalizationEnabled: true });
    const after = await affinityFor(user.id);
    expect(after[`video:genre:${titles[1].genres[0]}`]).toBeUndefined();
  });

  it("clears learned affinity without disturbing declared settings", async () => {
    await updatePreferences(user.id, { favoriteVideoGenres: ["drama"] });
    await recordEvent({ userId: user.id, domain: "VIDEO", action: "SAVED", media: titles[0] });

    await resetLearnedAffinity(user.id);
    expect(await affinityFor(user.id)).toEqual({});
    expect((await getOrCreatePreferences(user.id)).favoriteVideoGenres).toEqual(["drama"]);
  });

  it("resets everything on request", async () => {
    await updatePreferences(user.id, { favoriteVideoGenres: ["drama"], familyFriendlyOnly: true });
    const reset = await resetPreferences(user.id);
    expect(reset.favoriteVideoGenres).toEqual([]);
    expect(reset.familyFriendlyOnly).toBe(false);
    expect(reset.languages).toEqual(["en"]);
  });

  it("records searches and lets the user delete them", async () => {
    await searchVideo({ query: "a tense thriller", userId: user.id, limit: 5 });
    await searchVideo({ query: "something gentle", userId: user.id, limit: 5 });

    const history = await listSearchHistory(user.id);
    expect(history).toHaveLength(2);
    expect(history[0].query).toBe("something gentle"); // newest first

    expect(await deleteSearchHistoryEntry(user.id, history[0].id)).toBe(true);
    expect(await listSearchHistory(user.id)).toHaveLength(1);

    expect(await clearSearchHistory(user.id)).toBe(1);
    expect(await listSearchHistory(user.id)).toHaveLength(0);
  });

  it("keeps one user's history invisible to another", async () => {
    const other = await makeUser();
    await searchVideo({ query: "private search", userId: user.id, limit: 3 });

    expect(await listSearchHistory(other.id)).toHaveLength(0);
    const [entry] = await listSearchHistory(user.id);
    expect(await deleteSearchHistoryEntry(other.id, entry.id)).toBe(false);
    expect(await listSearchHistory(user.id)).toHaveLength(1);
  });

  it("does not fail a search when analytics writing is impossible", async () => {
    // A user id that does not exist violates the foreign key; recordEvent must
    // swallow that rather than break the request it was observing.
    await expect(
      recordEvent({ userId: "usr_does_not_exist", domain: "VIDEO", action: "SAVED", media: titles[0] }),
    ).resolves.toBeUndefined();
  });
});
