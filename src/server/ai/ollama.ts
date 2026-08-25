/**
 * Ollama access via LangChain.
 *
 * The LLM is used for language work only — understanding a request, ranking
 * candidates we already retrieved, and explaining a choice. It is never the
 * source of truth for catalogue facts: every title the user sees comes from
 * validated provider data in our own database.
 */
import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";

import { getEnv } from "@/server/config/env";
import { llmUnavailable } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

let chatModel: ChatOllama | null = null;
let jsonModel: ChatOllama | null = null;
let embedder: OllamaEmbeddings | null = null;

/** Free-form chat model (explanations, assistant replies). */
export function getChatModel(): ChatOllama {
  if (chatModel) return chatModel;
  const env = getEnv();
  chatModel = new ChatOllama({
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_CHAT_MODEL,
    temperature: env.LLM_TEMPERATURE,
    maxRetries: env.LLM_MAX_RETRIES,
    numPredict: 512,
  });
  return chatModel;
}

/**
 * Same model pinned to JSON output mode and temperature 0 — used for anything
 * whose result is parsed rather than displayed.
 */
export function getJsonModel(): ChatOllama {
  if (jsonModel) return jsonModel;
  const env = getEnv();
  jsonModel = new ChatOllama({
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_CHAT_MODEL,
    temperature: 0,
    format: "json",
    maxRetries: env.LLM_MAX_RETRIES,
    numPredict: 900,
  });
  return jsonModel;
}

export function getEmbedder(): OllamaEmbeddings {
  if (embedder) return embedder;
  const env = getEnv();
  embedder = new OllamaEmbeddings({
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_EMBED_MODEL,
  });
  return embedder;
}

export function resetModels(): void {
  chatModel = null;
  jsonModel = null;
  embedder = null;
}

export interface OllamaHealth {
  reachable: boolean;
  chatModelPresent: boolean;
  embedModelPresent: boolean;
  models: string[];
  error?: string;
}

/**
 * Probe `/api/tags`. Used by the health endpoint and by the pipeline to decide
 * whether to attempt LLM stages at all — a fast fail beats a 45s timeout.
 */
export async function checkOllama(timeoutMs = 2_500): Promise<OllamaHealth> {
  const env = getEnv();
  if (env.DISABLE_LLM) {
    return {
      reachable: false,
      chatModelPresent: false,
      embedModelPresent: false,
      models: [],
      error: "DISABLE_LLM is set",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        reachable: false,
        chatModelPresent: false,
        embedModelPresent: false,
        models: [],
        error: `Ollama responded ${response.status}`,
      };
    }
    const payload = (await response.json()) as { models?: Array<{ name: string }> };
    const models = (payload.models ?? []).map((m) => m.name);
    const has = (want: string) =>
      models.some((name) => name === want || name.split(":")[0] === want.split(":")[0]);
    return {
      reachable: true,
      chatModelPresent: has(env.OLLAMA_CHAT_MODEL),
      embedModelPresent: has(env.OLLAMA_EMBED_MODEL),
      models,
    };
  } catch (error) {
    return {
      reachable: false,
      chatModelPresent: false,
      embedModelPresent: false,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached availability so a down Ollama doesn't add seconds to every request.
 * Negative results are re-checked after 15s, positive ones after 60s.
 */
let cachedHealth: { value: OllamaHealth; checkedAt: number } | null = null;

export async function llmAvailable(): Promise<boolean> {
  const ttl = cachedHealth?.value.reachable ? 60_000 : 15_000;
  if (cachedHealth && Date.now() - cachedHealth.checkedAt < ttl) {
    return cachedHealth.value.reachable;
  }
  const value = await checkOllama();
  cachedHealth = { value, checkedAt: Date.now() };
  if (!value.reachable) {
    logger.warn("ollama unavailable, running in degraded mode", { error: value.error });
  }
  return value.reachable;
}

export function resetHealthCache(): void {
  cachedHealth = null;
}

/** Wrap an LLM call in a hard timeout so a stalled model can't hang a request. */
export async function withLlmTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const env = getEnv();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(llmUnavailable(new Error(`${label} exceeded ${env.LLM_TIMEOUT_MS}ms`))),
          env.LLM_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
