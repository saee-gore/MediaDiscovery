import { getEnv } from "@/server/config/env";
import { route } from "@/server/http/handler";
import { forbidden, notFound } from "@/server/lib/errors";
import { isJobName, JOBS, runJob } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Token-protected job trigger, so an external scheduler (cron, a platform
 * scheduler, a CI step) can drive the same jobs the CLI runs. The token is a
 * shared secret in `x-job-token`; it is never accepted from a query string,
 * where it would end up in access logs.
 */
export const POST = route("jobs.run", async (request, context) => {
  const env = getEnv();
  const token = request.headers.get("x-job-token");
  if (!token || token !== env.JOB_TOKEN) throw forbidden("Invalid job token.");

  const { name } = await context.params;
  if (!isJobName(name)) throw notFound("That job");

  const result = await runJob(name);
  return { job: result, description: JOBS[name].description };
});

export const GET = route("jobs.list", async (request) => {
  const env = getEnv();
  const token = request.headers.get("x-job-token");
  if (!token || token !== env.JOB_TOKEN) throw forbidden("Invalid job token.");
  return {
    jobs: Object.entries(JOBS).map(([name, job]) => ({ name, description: job.description })),
  };
});
