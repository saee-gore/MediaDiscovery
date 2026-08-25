/**
 * Global test environment.
 *
 * DISABLE_LLM keeps every suite deterministic: the query parser uses its
 * heuristic path, the reranker its metadata path, and embeddings the hashing
 * fallback. The LLM-specific behaviour (JSON repair, hallucinated-id rejection)
 * is tested directly against those units instead of through a live model.
 */
Object.assign(process.env, {
  NODE_ENV: "test",
  DISABLE_LLM: "1",
  LOG_LEVEL: "silent",
  AUTH_SECRET: "test-secret-value-that-is-long-enough-abcdef",
  JOB_TOKEN: "test-job-token",
  EMBEDDING_DIMENSIONS: "768",
  SPOTIFY_CLIENT_ID: "",
  SPOTIFY_CLIENT_SECRET: "",
  TMDB_API_KEY: "",
});
