/**
 * Run a background job from the command line.
 *
 *   npm run jobs:top50
 *   npx tsx scripts/run-job.ts refresh-trending
 *   npx tsx scripts/run-job.ts all
 */
import "dotenv/config";

import { closeDb } from "../src/server/db";
import { isJobName, JOBS, runJob, type JobName } from "../src/server/jobs";

const ORDER: JobName[] = [
  "ingest-catalogue",
  "backfill-embeddings",
  "refresh-top-50",
  "refresh-trending",
];

async function main() {
  const requested = process.argv[2];
  if (!requested) {
    console.log("Usage: tsx scripts/run-job.ts <job|all>\n\nAvailable jobs:");
    for (const [name, job] of Object.entries(JOBS)) {
      console.log(`  ${name.padEnd(22)} ${job.description}`);
    }
    console.log("  all                    Run every job in dependency order.");
    return;
  }

  const names = requested === "all" ? ORDER : [requested];
  let failed = false;

  for (const name of names) {
    if (!isJobName(name)) {
      console.error(`Unknown job: ${name}`);
      failed = true;
      continue;
    }
    const result = await runJob(name);
    const line = `${result.status === "SUCCESS" ? "✓" : "✗"} ${name} — ${result.processed} processed in ${result.durationMs}ms`;
    console.log(line);
    if (result.detail) console.log(`  ${JSON.stringify(result.detail)}`);
    if (result.error) {
      console.error(`  ${result.error}`);
      failed = true;
    }
  }

  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
