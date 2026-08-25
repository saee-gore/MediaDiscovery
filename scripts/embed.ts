/**
 * Generate embeddings for anything whose document changed.
 *   npm run embed
 *
 * Run this after starting Ollama for the first time: items embedded with the
 * offline hashing fallback are considered stale under the real model and get
 * regenerated automatically.
 */
import "dotenv/config";

import { checkOllama } from "../src/server/ai/ollama";
import { getEnv } from "../src/server/config/env";
import { closeDb } from "../src/server/db";
import { runJob } from "../src/server/jobs";
import { catalogueStats } from "../src/server/services/catalog";

async function main() {
  const env = getEnv();
  const health = await checkOllama();
  if (!health.reachable) {
    console.warn(
      `Ollama unreachable at ${env.OLLAMA_BASE_URL} — using the offline hashing embedder.\n` +
        "Semantic quality will be limited until you start Ollama and re-run this.",
    );
  } else if (!health.embedModelPresent) {
    console.warn(`Model ${env.OLLAMA_EMBED_MODEL} is not pulled. Run: ollama pull ${env.OLLAMA_EMBED_MODEL}`);
  }

  const result = await runJob("backfill-embeddings");
  const stats = await catalogueStats();
  console.log(`${result.status}: embedded ${result.processed} items in ${result.durationMs}ms`);
  console.log(`Coverage: ${stats.embedded}/${stats.total}`);
  if (result.error) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
