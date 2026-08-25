/**
 * Monthly charts (the Top 50 Pop experience).
 *
 * A chart is an immutable monthly snapshot rather than a live query, which is
 * what makes rank movement possible: this month's entry knows last month's
 * position, so the UI can show climbers, fallers and new entries instead of an
 * undated list. Re-running the job inside the same month replaces that month's
 * snapshot and still compares against the previous one.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import type { ChartDto, ChartEntryDto, MediaSummary } from "@/lib/types";
import { TOP_50_CHART_ID } from "@/server/config/constants";
import { getEnv } from "@/server/config/env";
import { db } from "@/server/db";
import { chartEntries, chartSnapshots } from "@/server/db/schema";
import { createId } from "@/server/lib/id";
import { logger } from "@/server/lib/logger";
import { notFound } from "@/server/lib/errors";
import { fetchChartCandidates } from "@/server/providers";
import { ensureEmbedded, upsertRecords } from "@/server/services/catalog";
import { fetchMediaByIds, listMedia } from "@/server/vector/store";

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return currentPeriod(date);
}

export function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Chart score. Popularity dominates, with a recency bonus so a hit from this
 * year outranks an equally popular one from five years ago — which is what
 * "this month's chart" is supposed to mean.
 */
export function chartScore(media: MediaSummary, now = new Date()): number {
  const popularity = media.popularity ?? 0;
  const year = media.releaseYear ?? now.getUTCFullYear() - 10;
  const age = Math.max(0, now.getUTCFullYear() - year);
  const recency = Math.max(0, 20 - age * 3.5);
  return popularity + recency;
}

const POP_MATCH = /\b(pop|dance pop|electropop|synth-?pop|indie pop|k-pop|country pop|disco)\b/i;

function isPop(media: MediaSummary): boolean {
  return media.genres.some((genre) => POP_MATCH.test(genre));
}

export interface RefreshResult {
  chartId: string;
  period: string;
  entries: number;
  source: string;
  newEntries: number;
  climbers: number;
  fallers: number;
}

export async function refreshTop50(options: { period?: string } = {}): Promise<RefreshResult> {
  const env = getEnv();
  const period = options.period ?? currentPeriod();
  const size = env.TOP50_CHART_SIZE;

  // 1. Pull candidates and fold them into the catalogue.
  const { records, source } = await fetchChartCandidates(size);
  if (records.length) {
    const { ids } = await upsertRecords(records);
    await ensureEmbedded(ids);
  }

  // 2. Rank. Prefer pop; widen only if pop alone can't fill the chart.
  const pool = await listMedia({ domain: "MUSIC", mediaTypes: ["TRACK"] }, size * 6, "popularity");
  const popTracks = pool.filter(isPop);
  const ranked = (popTracks.length >= size ? popTracks : [...popTracks, ...pool.filter((m) => !isPop(m))])
    .map((media) => ({ media, score: chartScore(media) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, size);

  if (ranked.length === 0) {
    logger.warn("chart refresh produced no entries, is the catalogue empty?", { chartId: TOP_50_CHART_ID });
  }

  // 3. Compare against last month.
  const previous = await getSnapshotEntries(TOP_50_CHART_ID, previousPeriod(period));
  const previousRanks = new Map(previous.map((entry) => [entry.mediaId, entry]));

  // 4. Replace this month's snapshot.
  await db
    .delete(chartSnapshots)
    .where(and(eq(chartSnapshots.chartId, TOP_50_CHART_ID), eq(chartSnapshots.period, period)));

  const [snapshot] = await db
    .insert(chartSnapshots)
    .values({
      id: createId("snap"),
      chartId: TOP_50_CHART_ID,
      period,
      label: `Top ${size} Pop · ${periodLabel(period)}`,
      source,
      itemCount: ranked.length,
    })
    .returning();

  let newEntries = 0;
  let climbers = 0;
  let fallers = 0;

  const values = ranked.map(({ media, score }, index) => {
    const rank = index + 1;
    const before = previousRanks.get(media.id);
    const previousRank = before?.rank ?? null;
    const movement = previousRank === null ? null : previousRank - rank;
    if (previousRank === null) newEntries += 1;
    else if (movement! > 0) climbers += 1;
    else if (movement! < 0) fallers += 1;

    return {
      id: createId("ce"),
      snapshotId: snapshot.id,
      mediaId: media.id,
      rank,
      previousRank,
      movement,
      isNewEntry: previousRank === null,
      peakRank: before?.peakRank != null ? Math.min(before.peakRank, rank) : rank,
      weeksOnChart: (before?.weeksOnChart ?? 0) + 1,
      score,
      snapshot: media as unknown as Record<string, unknown>,
    };
  });

  if (values.length) await db.insert(chartEntries).values(values);

  logger.info("chart refreshed", {
    chartId: TOP_50_CHART_ID,
    period,
    entries: values.length,
    source,
    newEntries,
  });

  return {
    chartId: TOP_50_CHART_ID,
    period,
    entries: values.length,
    source,
    newEntries,
    climbers,
    fallers,
  };
}

async function getSnapshotEntries(
  chartId: string,
  period: string,
): Promise<Array<{ mediaId: string; rank: number; peakRank: number | null; weeksOnChart: number }>> {
  const [snapshot] = await db
    .select()
    .from(chartSnapshots)
    .where(and(eq(chartSnapshots.chartId, chartId), eq(chartSnapshots.period, period)))
    .limit(1);
  if (!snapshot) return [];

  const rows = await db
    .select()
    .from(chartEntries)
    .where(eq(chartEntries.snapshotId, snapshot.id));
  return rows
    .filter((row) => row.mediaId)
    .map((row) => ({
      mediaId: row.mediaId!,
      rank: row.rank,
      peakRank: row.peakRank,
      weeksOnChart: row.weeksOnChart,
    }));
}

export interface GetChartOptions {
  period?: string;
  search?: string;
  sort?: "rank" | "popularity" | "newest";
  limit?: number;
}

export async function getChart(
  chartId: string = TOP_50_CHART_ID,
  options: GetChartOptions = {},
): Promise<ChartDto> {
  const periods = await listPeriods(chartId);
  if (periods.length === 0) throw notFound("That chart");
  const period = options.period && periods.includes(options.period) ? options.period : periods[0];

  const [snapshot] = await db
    .select()
    .from(chartSnapshots)
    .where(and(eq(chartSnapshots.chartId, chartId), eq(chartSnapshots.period, period)))
    .limit(1);
  if (!snapshot) throw notFound("That chart period");

  const rows = await db
    .select()
    .from(chartEntries)
    .where(eq(chartEntries.snapshotId, snapshot.id))
    .orderBy(chartEntries.rank);

  // Refresh snapshots from the live catalogue where possible so artwork and
  // popularity stay current without rewriting the historical ranking.
  const ids = rows.map((row) => row.mediaId).filter((id): id is string => Boolean(id));
  const current = await fetchMediaByIds(ids);

  let entries: ChartEntryDto[] = rows.map((row) => ({
    rank: row.rank,
    previousRank: row.previousRank,
    movement: row.movement,
    isNewEntry: row.isNewEntry,
    peakRank: row.peakRank,
    weeksOnChart: row.weeksOnChart,
    score: row.score,
    media:
      (row.mediaId ? current.get(row.mediaId) : undefined) ??
      (row.snapshot as unknown as MediaSummary),
  }));

  if (options.search?.trim()) {
    const needle = options.search.trim().toLowerCase();
    entries = entries.filter((entry) =>
      [entry.media.title, entry.media.subtitle, entry.media.album ?? "", ...entry.media.genres]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  if (options.sort === "popularity") {
    entries = [...entries].sort((a, b) => b.media.popularity - a.media.popularity);
  } else if (options.sort === "newest") {
    entries = [...entries].sort(
      (a, b) => (b.media.releaseYear ?? 0) - (a.media.releaseYear ?? 0),
    );
  }

  if (options.limit) entries = entries.slice(0, options.limit);

  return {
    chartId,
    period,
    label: snapshot.label,
    generatedAt: snapshot.generatedAt.toISOString(),
    itemCount: snapshot.itemCount,
    source: snapshot.source,
    entries,
    availablePeriods: periods,
  };
}

export async function listPeriods(chartId: string = TOP_50_CHART_ID): Promise<string[]> {
  const rows = await db
    .select({ period: chartSnapshots.period })
    .from(chartSnapshots)
    .where(eq(chartSnapshots.chartId, chartId))
    .orderBy(desc(chartSnapshots.period));
  return rows.map((row) => row.period);
}

export async function chartExists(chartId: string = TOP_50_CHART_ID): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chartSnapshots)
    .where(eq(chartSnapshots.chartId, chartId));
  return Number(row?.count ?? 0) > 0;
}

/** Insight strip shown above the chart. */
export async function chartInsights(chartId: string = TOP_50_CHART_ID): Promise<{
  topClimber: ChartEntryDto | null;
  biggestFall: ChartEntryDto | null;
  newEntries: number;
  highestNewEntry: ChartEntryDto | null;
}> {
  const chart = await getChart(chartId).catch(() => null);
  if (!chart) {
    return { topClimber: null, biggestFall: null, newEntries: 0, highestNewEntry: null };
  }
  const moved = chart.entries.filter((entry) => entry.movement !== null);
  const climbers = [...moved].sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0));
  const fallers = [...moved].sort((a, b) => (a.movement ?? 0) - (b.movement ?? 0));
  const fresh = chart.entries.filter((entry) => entry.isNewEntry);

  return {
    topClimber: climbers[0] && (climbers[0].movement ?? 0) > 0 ? climbers[0] : null,
    biggestFall: fallers[0] && (fallers[0].movement ?? 0) < 0 ? fallers[0] : null,
    newEntries: fresh.length,
    highestNewEntry: fresh[0] ?? null,
  };
}

export { TOP_50_CHART_ID };
