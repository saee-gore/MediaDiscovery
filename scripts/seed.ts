/**
 * One-shot bootstrap: catalogue -> embeddings -> first chart -> sample lists.
 *
 *   npm run seed
 *
 * Safe to re-run. Content hashing means unchanged items are skipped and their
 * embeddings survive, so a second run costs seconds rather than minutes.
 */
import "dotenv/config";

import { checkOllama } from "../src/server/ai/ollama";
import { getEnv } from "../src/server/config/env";
import { closeDb } from "../src/server/db";
import { runJob } from "../src/server/jobs";
import { providerStatus } from "../src/server/providers";
import { catalogueStats } from "../src/server/services/catalog";
import { createBucketList } from "../src/server/services/bucket-lists";
import { createPlaylist, listPlaylists } from "../src/server/services/playlists";
import { getUserByEmail, getUserById, registerUser, setPassword } from "../src/server/services/users";
import { listMedia } from "../src/server/vector/store";

/**
 * Resolve the account these sample collections belong to.
 *
 * An installation that predates accounts owns everything under the id `local`.
 * Adopting that row rather than creating a fresh one means an upgrade keeps the
 * playlists it already had, instead of signing you into an empty library.
 */
async function ensureAccount() {
  const legacy = await getUserById("local");
  if (legacy && !legacy.passwordHash) {
    await setPassword(legacy.id, DEMO_PASSWORD);
    console.log(`✓ account              adopted existing library: ${legacy.email} / ${DEMO_PASSWORD}`);
    return legacy;
  }

  const existing = await getUserByEmail(DEMO_EMAIL);
  if (existing) return existing;

  const created = await registerUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "You" });
  console.log(`✓ account              ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  return created;
}

async function main() {
  const env = getEnv();
  const providers = providerStatus();
  const ollama = await checkOllama();

  console.log("Curated — bootstrap");
  console.log(`  music provider : ${providers.music}${providers.music === "seed" ? " (no Spotify credentials)" : ""}`);
  console.log(`  video provider : ${providers.video}${providers.video === "seed" ? " (no TMDB key)" : ""}`);
  console.log(
    `  ollama         : ${ollama.reachable ? "reachable" : `unreachable (${ollama.error ?? "unknown"})`}`,
  );
  if (ollama.reachable && !ollama.embedModelPresent) {
    console.log(`    ! ${env.OLLAMA_EMBED_MODEL} is not pulled. Run: ollama pull ${env.OLLAMA_EMBED_MODEL}`);
  }
  if (!ollama.reachable) {
    console.log("    Embeddings will use the offline hashing fallback for now.");
    console.log("    Start Ollama and run `npm run embed` to upgrade them.");
  }
  console.log("");

  for (const job of ["ingest-catalogue", "backfill-embeddings", "refresh-top-50"] as const) {
    const result = await runJob(job);
    console.log(
      `${result.status === "SUCCESS" ? "✓" : "✗"} ${job.padEnd(20)} ${result.processed} processed (${result.durationMs}ms)`,
    );
    if (result.error) console.error(`  ${result.error}`);
  }

  await seedSampleCollections();

  const stats = await catalogueStats();
  console.log("");
  console.log(`Catalogue: ${stats.total} items (${stats.music} music, ${stats.video} film & TV)`);
  console.log(`Embedded : ${stats.embedded}/${stats.total}`);
  console.log("");
  console.log("Run `npm run dev` and open http://localhost:3000");
  console.log(`Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}, or create your own account.`);
}

const DEMO_EMAIL = process.env.SEED_EMAIL?.trim().toLowerCase() || "demo@curated.app";
const DEMO_PASSWORD = process.env.SEED_PASSWORD || "curated123";

/**
 * A first run with something already on the shelves beats an empty one, and an
 * account you can actually sign into beats a sign-in form with no valid
 * credentials behind it. Override with SEED_EMAIL / SEED_PASSWORD.
 */
async function seedSampleCollections() {
  const user = await ensureAccount();
  const userId = user.id;

  if ((await listPlaylists(userId)).length > 0) {
    console.log("✓ sample collections   already present");
    return;
  }

  const tracks = await listMedia({ domain: "MUSIC", mediaTypes: ["TRACK"] }, 12, "popularity");
  const films = await listMedia({ domain: "VIDEO", mediaTypes: ["MOVIE"] }, 8, "popularity");
  const series = await listMedia({ domain: "VIDEO", mediaTypes: ["SERIES"] }, 6, "popularity");

  if (tracks.length) {
    await createPlaylist(userId, {
      name: "Late Night Drive",
      description: "Synths, momentum, and a road with nobody on it.",
      accent: "violet",
      mediaIds: tracks.slice(0, 8).map((track) => track.id),
    });
  }
  if (films.length) {
    await createBucketList(userId, {
      name: "Weekend Watchlist",
      description: "Two evenings, two films.",
      accent: "amber",
      mediaIds: films.slice(0, 5).map((film) => film.id),
    });
  }
  if (series.length) {
    await createBucketList(userId, {
      name: "Comfort Shows",
      description: "Low stakes, high warmth.",
      accent: "orange",
      mediaIds: series.slice(0, 4).map((show) => show.id),
    });
  }

  console.log("✓ sample collections   created");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
