/**
 * Validated server environment.
 *
 * Import this instead of touching `process.env` directly: it fails loudly at
 * boot for genuinely required values, applies documented defaults everywhere
 * else, and exposes `hasSpotify` / `hasTmdb` so services can pick the live
 * provider or the bundled seed catalogue without re-deriving that decision.
 */
import { z } from "zod";

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : /^(1|true|yes|on)$/i.test(v)));

const num = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const str = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v));

const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),

  DATABASE_URL: str("postgresql://curated:curated@localhost:5432/curated?schema=public"),

  OLLAMA_BASE_URL: str("http://localhost:11434"),
  OLLAMA_CHAT_MODEL: str("llama3.1:8b"),
  OLLAMA_EMBED_MODEL: str("nomic-embed-text"),
  EMBEDDING_DIMENSIONS: num(768),
  LLM_TEMPERATURE: num(0.2),
  LLM_TIMEOUT_MS: num(45_000),
  LLM_MAX_RETRIES: num(2),

  SPOTIFY_CLIENT_ID: optionalStr,
  SPOTIFY_CLIENT_SECRET: optionalStr,
  SPOTIFY_MARKET: str("US"),

  TMDB_API_KEY: optionalStr,
  TMDB_LANGUAGE: str("en-US"),
  TMDB_IMAGE_BASE: str("https://image.tmdb.org/t/p/w500"),

  VECTOR_TOP_K: num(40),
  VECTOR_MIN_SCORE: num(0.15),
  HYBRID_VECTOR_WEIGHT: num(0.6),
  HYBRID_KEYWORD_WEIGHT: num(0.25),
  HYBRID_POPULARITY_WEIGHT: num(0.15),
  RERANK_CANDIDATES: num(24),
  RESULT_LIMIT: num(20),

  AUTH_SECRET: str("curated-development-secret-change-me-in-production"),
  JOB_TOKEN: str("curated-dev-job-token"),
  TOP50_CHART_SIZE: num(50),

  DISABLE_LLM: bool(false),
});

export type Env = z.infer<typeof schema> & {
  hasSpotify: boolean;
  hasTmdb: boolean;
  isProduction: boolean;
  isTest: boolean;
};

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  if (value.NODE_ENV === "production") {
    if (value.JOB_TOKEN.includes("dev-job-token")) {
      throw new Error("JOB_TOKEN must be changed from its default in production.");
    }
    if (value.AUTH_SECRET.includes("change-me") || value.AUTH_SECRET.length < 16) {
      throw new Error(
        "AUTH_SECRET must be set to a random string of at least 16 characters in production. " +
          "Generate one with: openssl rand -base64 32",
      );
    }
  }

  cached = {
    ...value,
    hasSpotify: Boolean(value.SPOTIFY_CLIENT_ID && value.SPOTIFY_CLIENT_SECRET),
    hasTmdb: Boolean(value.TMDB_API_KEY),
    isProduction: value.NODE_ENV === "production",
    isTest: value.NODE_ENV === "test",
  };

  return cached;
}

/** Test helper — forget the memoised environment. */
export function resetEnvCache(): void {
  cached = null;
}
