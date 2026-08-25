/**
 * Background jobs.
 *
 * Each job is an ordinary async function; `runJob` wraps one with a `job_runs`
 * record so every execution has a start, a duration, counts and — when it goes
 * wrong — the error. The same registry backs the CLI (`npm run jobs:*`), the
 * long-running scheduler and the token-protected HTTP trigger, so there is one
 * definition of what "refresh the Top 50" means.
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { jobRuns } from "@/server/db/schema";
import { createId } from "@/server/lib/id";
import { logger } from "@/server/lib/logger";
import { collectMusicCatalogue, collectVideoCatalogue, fetchTrendingVideo } from "@/server/providers";
import { catalogueStats, generateMissingEmbeddings, upsertRecords } from "@/server/services/catalog";
import { refreshTop50 } from "@/server/services/charts";

export interface JobOutcome {
  processed: number;
  skipped?: number;
  failed?: number;
  detail?: Record<string, unknown>;
}

export type JobName =
  | "ingest-catalogue"
  | "refresh-top-50"
  | "refresh-trending"
  | "backfill-embeddings";

type JobFn = () => Promise<JobOutcome>;

export const JOBS: Record<JobName, { description: string; run: JobFn }> = {
  "ingest-catalogue": {
    description: "Pull the full music and video catalogue from the active providers.",
    run: async () => {
      const [music, video] = await Promise.all([collectMusicCatalogue(), collectVideoCatalogue()]);
      const musicResult = await upsertRecords(music.records);
      const videoResult = await upsertRecords(video.records);
      return {
        processed: musicResult.ids.length + videoResult.ids.length,
        skipped: musicResult.unchanged + videoResult.unchanged,
        detail: {
          musicSource: music.source,
          videoSource: video.source,
          music: musicResult,
          video: videoResult,
        },
      };
    },
  },

  "refresh-top-50": {
    description: "Rebuild this month's Top 50 Pop snapshot and compute rank movement.",
    run: async () => {
      const result = await refreshTop50();
      return { processed: result.entries, detail: { ...result } };
    },
  },

  "refresh-trending": {
    description: "Refresh trending film and television, and this week's new music.",
    run: async () => {
      const [video, music] = await Promise.all([fetchTrendingVideo(40), collectMusicCatalogue()]);
      const videoResult = await upsertRecords(video);
      const musicResult = await upsertRecords(music.records.slice(0, 60));
      return {
        processed: videoResult.ids.length + musicResult.ids.length,
        skipped: videoResult.unchanged + musicResult.unchanged,
        detail: { video: videoResult, music: musicResult },
      };
    },
  },

  "backfill-embeddings": {
    description: "Generate embeddings for catalogue items whose document changed.",
    run: async () => {
      const result = await generateMissingEmbeddings(1000);
      const stats = await catalogueStats();
      return {
        processed: result.processed,
        detail: { ...result, coverage: `${stats.embedded}/${stats.total}` },
      };
    },
  },
};

export async function runJob(name: JobName): Promise<{
  id: string;
  name: JobName;
  status: "SUCCESS" | "FAILED";
  durationMs: number;
  processed: number;
  detail?: Record<string, unknown>;
  error?: string;
}> {
  const job = JOBS[name];
  if (!job) throw new Error(`Unknown job: ${name}`);

  const id = createId("job");
  const startedAt = Date.now();
  await db.insert(jobRuns).values({ id, name, status: "RUNNING" });
  logger.info("job started", { job: name, jobRunId: id });

  try {
    const outcome = await job.run();
    const durationMs = Date.now() - startedAt;
    await db
      .update(jobRuns)
      .set({
        status: "SUCCESS",
        finishedAt: new Date(),
        durationMs,
        processed: outcome.processed,
        skipped: outcome.skipped ?? 0,
        failed: outcome.failed ?? 0,
        detail: outcome.detail ?? null,
      })
      .where(eq(jobRuns.id, id));
    logger.info("job finished", { job: name, jobRunId: id, durationMs, processed: outcome.processed });
    return { id, name, status: "SUCCESS", durationMs, processed: outcome.processed, detail: outcome.detail };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(jobRuns)
      .set({ status: "FAILED", finishedAt: new Date(), durationMs, error: message })
      .where(eq(jobRuns.id, id));
    logger.error("job failed", { job: name, jobRunId: id, durationMs, error });
    return { id, name, status: "FAILED", durationMs, processed: 0, error: message };
  }
}

export async function recentJobRuns(limit = 20) {
  return db.select().from(jobRuns).orderBy(jobRuns.startedAt).limit(limit);
}

export function isJobName(value: string): value is JobName {
  return value in JOBS;
}
