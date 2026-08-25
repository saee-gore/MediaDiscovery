/**
 * Apply pending SQL migrations from ./drizzle.
 * Usage: npm run db:migrate
 */
import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('extension "vector"')) {
      console.error(
        "\nThe pgvector extension is not available on this Postgres server.\n" +
          "Install it, then run:  psql -d curated -c 'CREATE EXTENSION vector'\n" +
          "See the README section 'Installing Postgres' for the version trap on macOS.\n",
      );
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
