import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateAll } from "./helpers/database";
import { loadCatalogue } from "./helpers/fixtures";
import {
  chartInsights,
  chartScore,
  currentPeriod,
  getChart,
  listPeriods,
  periodLabel,
  previousPeriod,
  refreshTop50,
  TOP_50_CHART_ID,
} from "@/server/services/charts";
import type { MediaSummary } from "@/lib/types";

const media = (overrides: Partial<MediaSummary>): MediaSummary => ({
  id: "x",
  domain: "MUSIC",
  mediaType: "TRACK",
  title: "T",
  subtitle: "A",
  description: "",
  language: "en",
  adult: false,
  popularity: 50,
  genres: [],
  moods: [],
  themes: [],
  tags: [],
  source: "seed",
  ...overrides,
});

describe("period arithmetic", () => {
  it("formats and walks calendar months", () => {
    expect(currentPeriod(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01");
    expect(previousPeriod("2026-01")).toBe("2025-12");
    expect(previousPeriod("2026-03")).toBe("2026-02");
    expect(periodLabel("2026-08")).toBe("August 2026");
  });

  it("scores recent releases above equally popular old ones", () => {
    const now = new Date(Date.UTC(2026, 7, 1));
    const fresh = chartScore(media({ popularity: 80, releaseYear: 2026 }), now);
    const old = chartScore(media({ popularity: 80, releaseYear: 2005 }), now);
    expect(fresh).toBeGreaterThan(old);
  });
});

describe("Top 50 chart", () => {
  beforeAll(async () => {
    await createTestDatabase();
    await loadCatalogue({ music: 200, video: 20 });
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });

  it("builds a ranked snapshot where every entry is new the first month", async () => {
    const result = await refreshTop50({ period: "2026-06" });
    expect(result.entries).toBeGreaterThan(0);
    expect(result.newEntries).toBe(result.entries);
    expect(result.climbers).toBe(0);

    const chart = await getChart(TOP_50_CHART_ID, { period: "2026-06" });
    expect(chart.entries[0].rank).toBe(1);
    expect(chart.entries.every((entry) => entry.isNewEntry)).toBe(true);
    expect(chart.entries.every((entry) => entry.previousRank === null)).toBe(true);
    for (let i = 1; i < chart.entries.length; i += 1) {
      expect(chart.entries[i].rank).toBe(chart.entries[i - 1].rank + 1);
    }
  });

  it("prefers pop when there is enough of it", async () => {
    const chart = await getChart(TOP_50_CHART_ID, { period: "2026-06" });
    const popish = chart.entries.filter((entry) =>
      entry.media.genres.some((genre) => /pop|disco/i.test(genre)),
    );
    expect(popish.length / chart.entries.length).toBeGreaterThan(0.6);
  });

  it("computes rank movement against the previous month", async () => {
    await refreshTop50({ period: "2026-07" });
    const chart = await getChart(TOP_50_CHART_ID, { period: "2026-07" });

    const returning = chart.entries.filter((entry) => !entry.isNewEntry);
    expect(returning.length).toBeGreaterThan(0);
    for (const entry of returning) {
      expect(entry.previousRank).not.toBeNull();
      expect(entry.movement).toBe(entry.previousRank! - entry.rank);
      expect(entry.weeksOnChart).toBeGreaterThanOrEqual(2);
      expect(entry.peakRank).toBeLessThanOrEqual(entry.rank);
    }
  });

  it("replaces a month in place when re-run rather than duplicating it", async () => {
    const before = await listPeriods();
    await refreshTop50({ period: "2026-07" });
    const after = await listPeriods();
    expect(after).toEqual(before);
    expect(new Set(after).size).toBe(after.length);
  });

  it("supports searching and re-sorting a snapshot", async () => {
    const chart = await getChart(TOP_50_CHART_ID, { period: "2026-07" });
    const title = chart.entries[3].media.title;

    const searched = await getChart(TOP_50_CHART_ID, { period: "2026-07", search: title });
    expect(searched.entries.length).toBeGreaterThan(0);
    expect(searched.entries.some((entry) => entry.media.title === title)).toBe(true);

    const byNewest = await getChart(TOP_50_CHART_ID, { period: "2026-07", sort: "newest" });
    for (let i = 1; i < byNewest.entries.length; i += 1) {
      expect(byNewest.entries[i - 1].media.releaseYear ?? 0).toBeGreaterThanOrEqual(
        byNewest.entries[i].media.releaseYear ?? 0,
      );
    }
  });

  it("summarises climbers, fallers and new entries", async () => {
    const insights = await chartInsights(TOP_50_CHART_ID);
    expect(insights).toHaveProperty("newEntries");
    expect(typeof insights.newEntries).toBe("number");
  });

  it("reports not-found rather than crashing when no snapshot exists", async () => {
    await truncateAll();
    await expect(getChart(TOP_50_CHART_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
