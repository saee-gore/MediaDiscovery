/**
 * Pull the catalogue from the active providers (or the seed data).
 *   npm run ingest
 */
import "dotenv/config";

import { closeDb } from "../src/server/db";
import { runJob } from "../src/server/jobs";
import { providerStatus } from "../src/server/providers";

async function main() {
  const providers = providerStatus();
  console.log(`Ingesting — music: ${providers.music}, video: ${providers.video}`);
  const result = await runJob("ingest-catalogue");
  console.log(`${result.status}: ${result.processed} new or changed items in ${result.durationMs}ms`);
  if (result.detail) console.log(JSON.stringify(result.detail, null, 2));
  if (result.error) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
