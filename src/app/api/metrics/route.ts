import { desc } from "drizzle-orm";

import { db } from "@/server/db";
import { jobRuns } from "@/server/db/schema";
import { route } from "@/server/http/handler";
import { getMetrics } from "@/server/lib/logger";
import { catalogueStats } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

/**
 * In-process latency percentiles per span (routes, LLM calls, vector search,
 * provider calls) plus recent job outcomes. Metrics reset with the process —
 * this is an operability aid, not a time-series database.
 */
export const GET = route("metrics", async () => {
  const spans = getMetrics();
  const jobs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(10);

  const routes = Object.entries(spans).filter(([name]) => name.startsWith("route:"));
  const totalRequests = routes.reduce((sum, [, stats]) => sum + stats.count, 0);
  const totalFailures = routes.reduce((sum, [, stats]) => sum + stats.failures, 0);

  return {
    spans,
    summary: {
      requests: totalRequests,
      failures: totalFailures,
      errorRate: totalRequests ? Number((totalFailures / totalRequests).toFixed(4)) : 0,
      emptyResultRate: spans["search:empty"]
        ? Number((spans["search:empty"].count / Math.max(1, spans["search:total"]?.count ?? 1)).toFixed(4))
        : 0,
    },
    catalogue: await catalogueStats().catch(() => null),
    jobs: jobs.map((job) => ({
      name: job.name,
      status: job.status,
      startedAt: job.startedAt.toISOString(),
      durationMs: job.durationMs,
      processed: job.processed,
      error: job.error,
    })),
  };
});
