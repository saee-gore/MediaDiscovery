/**
 * Embedding generation.
 *
 * Primary path is Ollama (`nomic-embed-text` by default). When the model is
 * unreachable — or DISABLE_LLM is set, which is how the test suite and CI run —
 * we fall back to a deterministic hashing embedder. That fallback captures
 * lexical overlap only, not meaning, so it is tagged with its own model name
 * and the store refuses to compare vectors produced by different models. The
 * result is that a catalogue embedded offline stays internally consistent and
 * is transparently re-embedded once a real model is available.
 */
import { getEnv } from "@/server/config/env";
import { getEmbedder, llmAvailable, withLlmTimeout } from "@/server/ai/ollama";
import { logger, timed } from "@/server/lib/logger";

export const HASH_FALLBACK_MODEL = "hash-fallback-v1";

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  degraded: boolean;
}

/** Which embedding model would be used right now. */
export async function activeEmbeddingModel(): Promise<{ model: string; degraded: boolean }> {
  const env = getEnv();
  if (env.DISABLE_LLM) return { model: HASH_FALLBACK_MODEL, degraded: true };
  const available = await llmAvailable();
  return available
    ? { model: env.OLLAMA_EMBED_MODEL, degraded: false }
    : { model: HASH_FALLBACK_MODEL, degraded: true };
}

export async function embedTexts(texts: string[]): Promise<EmbeddingResult> {
  if (texts.length === 0) return { vectors: [], model: HASH_FALLBACK_MODEL, degraded: false };
  const env = getEnv();
  const { model, degraded } = await activeEmbeddingModel();

  if (degraded) {
    return {
      vectors: texts.map((text) => hashEmbedding(text, env.EMBEDDING_DIMENSIONS)),
      model: HASH_FALLBACK_MODEL,
      degraded: true,
    };
  }

  try {
    const vectors = await timed("embeddings:generate", () =>
      withLlmTimeout("embeddings", () => getEmbedder().embedDocuments(texts)),
    );
    const width = vectors[0]?.length ?? 0;
    if (width !== env.EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding model returned ${width} dimensions but the database column is ${env.EMBEDDING_DIMENSIONS}. ` +
          `Set EMBEDDING_DIMENSIONS=${width} and regenerate the migration, or switch models.`,
      );
    }
    return { vectors, model, degraded: false };
  } catch (error) {
    if (error instanceof Error && error.message.includes("dimensions")) throw error;
    logger.warn("embedding generation failed; using hashing fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      vectors: texts.map((text) => hashEmbedding(text, env.EMBEDDING_DIMENSIONS)),
      model: HASH_FALLBACK_MODEL,
      degraded: true,
    };
  }
}

export async function embedQuery(text: string): Promise<{ vector: number[]; model: string; degraded: boolean }> {
  const { vectors, model, degraded } = await embedTexts([text]);
  return { vector: vectors[0] ?? [], model, degraded };
}

// ---------------------------------------------------------------------------
// Deterministic hashing fallback
// ---------------------------------------------------------------------------

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A hashing vectoriser: unigrams and bigrams are hashed into buckets with
 * signed counts, then L2-normalised. Same input always yields the same vector,
 * and lexically similar documents land near each other — enough to keep the
 * retrieval pipeline meaningful without a model running.
 */
export function hashEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

  const add = (token: string, weight: number) => {
    const hash = fnv1a(token);
    const index = hash % dimensions;
    const sign = (hash >>> 31) & 1 ? -1 : 1;
    vector[index] += sign * weight;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    add(tokens[i], 1);
    if (i + 1 < tokens.length) add(`${tokens[i]}_${tokens[i + 1]}`, 0.6);
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    // An empty document still needs a valid unit vector.
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / norm);
}

/** pgvector literal form. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value.toFixed(6) : "0")).join(",")}]`;
}
