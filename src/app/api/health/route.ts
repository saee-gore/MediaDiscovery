import { sql } from "drizzle-orm";

import { getEnv } from "@/server/config/env";
import { checkOllama } from "@/server/ai/ollama";
import { db } from "@/server/db";
import { route } from "@/server/http/handler";
import { providerStatus } from "@/server/providers";
import { catalogueStats } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

/**
 * Liveness + dependency readiness. Deliberately reports "degraded" rather than
 * failing when the LLM is down — the app still serves catalogue results.
 */
export const GET = route("health", async () => {
  const env = getEnv();

  const database = await db
    .execute(sql`SELECT 1`)
    .then(() => ({ ok: true as const }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));

  const ollama = await checkOllama();
  const catalogue = database.ok
    ? await catalogueStats().catch(() => null)
    : null;

  const ready = database.ok && (catalogue?.total ?? 0) > 0;

  return {
    status: !database.ok ? "unhealthy" : ready && ollama.reachable ? "healthy" : "degraded",
    version: process.env.npm_package_version ?? "1.0.0",
    environment: env.NODE_ENV,
    database,
    ollama: {
      reachable: ollama.reachable,
      chatModel: env.OLLAMA_CHAT_MODEL,
      chatModelPresent: ollama.chatModelPresent,
      embedModel: env.OLLAMA_EMBED_MODEL,
      embedModelPresent: ollama.embedModelPresent,
      error: ollama.error,
    },
    providers: providerStatus(),
    catalogue,
  };
});
