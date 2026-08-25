/**
 * Long-running job scheduler.
 *
 *   npm run scheduler
 *
 * A deliberately small in-process scheduler: no queue, no broker, one process.
 * That is the right size for this application, and the alternative — driving
 * POST /api/jobs/:name from platform cron — is a one-line swap because both
 * paths call the same job registry.
 *
 * Cadence:
 *   embeddings  every 15 min   (cheap; only touches changed documents)
 *   trending    every  6 h
 *   catalogue   every 24 h
 *   top 50      every 24 h, and immediately when the month has rolled over
 */
import "dotenv/config";

import { closeDb } from "../src/server/db";
import { runJob, type JobName } from "../src/server/jobs";
import { currentPeriod, listPeriods } from "../src/server/services/charts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

interface Schedule {
  job: JobName;
  everyMs: number;
  runOnStart: boolean;
}

const SCHEDULES: Schedule[] = [
  { job: "backfill-embeddings", everyMs: 15 * MINUTE, runOnStart: true },
  { job: "refresh-trending", everyMs: 6 * HOUR, runOnStart: false },
  { job: "ingest-catalogue", everyMs: 24 * HOUR, runOnStart: false },
  { job: "refresh-top-50", everyMs: 24 * HOUR, runOnStart: false },
];

let running = false;

/** Jobs never overlap: a slow run delays the next tick rather than stacking. */
async function guarded(job: JobName) {
  if (running) {
    console.log(`[scheduler] skipping ${job} — another job is still running`);
    return;
  }
  running = true;
  try {
    const result = await runJob(job);
    console.log(
      `[scheduler] ${job}: ${result.status} (${result.processed} processed, ${result.durationMs}ms)`,
    );
  } finally {
    running = false;
  }
}

async function ensureCurrentMonthChart() {
  const periods = await listPeriods();
  if (!periods.includes(currentPeriod())) {
    console.log("[scheduler] new month detected — rebuilding the Top 50");
    await guarded("refresh-top-50");
  }
}

async function main() {
  console.log("[scheduler] started");
  const timers: NodeJS.Timeout[] = [];

  for (const schedule of SCHEDULES) {
    if (schedule.runOnStart) await guarded(schedule.job);
    timers.push(setInterval(() => void guarded(schedule.job), schedule.everyMs));
  }

  await ensureCurrentMonthChart();
  timers.push(setInterval(() => void ensureCurrentMonthChart(), HOUR));

  const shutdown = async (signal: string) => {
    console.log(`[scheduler] ${signal} — shutting down`);
    for (const timer of timers) clearInterval(timer);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
