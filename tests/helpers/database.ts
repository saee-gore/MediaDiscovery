/**
 * Test database.
 *
 * PGlite is a full Postgres build compiled to WASM, with pgvector available as
 * an extension — so these tests run the real migration, the real `<=>` cosine
 * operator and the real full-text SQL, in-process, with no Docker. Only the
 * driver differs from production.
 */
import fs from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";

import { setDatabase, type Database } from "@/server/db";
import * as schema from "@/server/db/schema";

let client: PGlite | null = null;

/**
 * The generated migration is applied statement by statement. HNSW indexes are
 * skipped: PGlite's pgvector build does not include them, and an ANN index is
 * an optimisation — the same queries run correctly without it.
 */
async function applyMigrations(pg: PGlite): Promise<void> {
  // Every migration, in filename order, so the test schema cannot drift from
  // production the moment a second one is added.
  const dir = path.resolve(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const sqlText = fs.readFileSync(path.join(dir, name), "utf8");
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      if (/USING hnsw/i.test(statement)) continue;
      try {
        await pg.exec(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${name} failed: ${message}\n---\n${statement.slice(0, 400)}`);
      }
    }
  }
}

export async function createTestDatabase(): Promise<Database> {
  client = await PGlite.create({ extensions: { vector } });
  await applyMigrations(client);
  const db = drizzle(client, { schema }) as unknown as Database;
  setDatabase(db);
  return db;
}

export async function destroyTestDatabase(): Promise<void> {
  setDatabase(null);
  await client?.close();
  client = null;
}

/** Wipe user data between tests while keeping the catalogue in place. */
export async function truncateUserData(): Promise<void> {
  if (!client) return;
  await client.exec(`
    TRUNCATE TABLE recommendation_events, search_history, playlist_items, playlists,
                   bucket_list_items, bucket_lists, user_preferences, users
    RESTART IDENTITY CASCADE;
  `);
}

export async function truncateAll(): Promise<void> {
  if (!client) return;
  await client.exec(`
    TRUNCATE TABLE recommendation_events, search_history, playlist_items, playlists,
                   bucket_list_items, bucket_lists, user_preferences, users,
                   chart_entries, chart_snapshots, media_items, job_runs
    RESTART IDENTITY CASCADE;
  `);
}
