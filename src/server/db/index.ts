/**
 * Database handle.
 *
 * Production/development run on node-postgres against Postgres 16 + pgvector.
 * Tests inject an in-process PGlite instance (a real Postgres build compiled to
 * WASM, vector extension included) through `setDatabase`, so the whole test
 * suite exercises the same SQL — including `<=>` vector distance — with no
 * external service.
 */
import type { SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "@/server/config/env";
import * as schema from "@/server/db/schema";

export type Database = NodePgDatabase<typeof schema>;

let instance: Database | null = null;
let pool: Pool | null = null;

function createDatabase(): Database {
  const env = getEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.isProduction ? 10 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    // A pooled client died while idle; the pool replaces it. Log, never crash.
    console.error("[db] idle client error", error.message);
  });
  return drizzle(pool, { schema });
}

/**
 * In dev, Next.js hot-reload re-evaluates modules; cache the handle on
 * globalThis so we do not leak a connection pool per reload.
 */
const globalRef = globalThis as unknown as { __curatedDb?: Database };

export function getDb(): Database {
  if (instance) return instance;
  if (globalRef.__curatedDb) {
    instance = globalRef.__curatedDb;
    return instance;
  }
  instance = createDatabase();
  if (process.env.NODE_ENV !== "production") globalRef.__curatedDb = instance;
  return instance;
}

/** Swap in another Drizzle handle (used by the test harness). */
export function setDatabase(next: Database | null): void {
  instance = next;
  globalRef.__curatedDb = next ?? undefined;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  instance = null;
  globalRef.__curatedDb = undefined;
}

/**
 * Lazily-resolved proxy so modules can `import { db }` at load time without
 * forcing a connection during module evaluation (important for tests and for
 * Next.js build-time module graph analysis).
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, property, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Run raw SQL and always get an array of rows back, whichever driver is active.
 * node-postgres returns `{ rows }`; PGlite's Drizzle driver returns the rows
 * directly in some versions.
 */
export async function executeRows<T = Record<string, unknown>>(query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export { schema };
