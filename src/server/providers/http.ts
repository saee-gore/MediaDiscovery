/**
 * Shared HTTP client for external providers: timeouts, retry with exponential
 * backoff and jitter, and correct handling of 429 `Retry-After`.
 */
import { rateLimited, upstreamUnavailable } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  /** Provider name used in error messages and logs. */
  service: string;
  /** Status codes to return `null` for rather than throwing (e.g. 404). */
  softFail?: number[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T | null> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 12_000,
    retries = 3,
    service,
    softFail = [],
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        if (attempt === retries) throw rateLimited(`${service} rate limit reached.`);
        const waitMs = Math.min(30_000, (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
        logger.warn("upstream rate limited", { service, waitMs, attempt });
        await sleep(waitMs);
        continue;
      }

      if (softFail.includes(response.status)) return null;

      if (response.status >= 500) {
        lastError = new Error(`${service} responded ${response.status}`);
        if (attempt === retries) throw upstreamUnavailable(service, lastError);
        await sleep(backoff(attempt));
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw upstreamUnavailable(
          service,
          new Error(`${service} responded ${response.status}: ${text.slice(0, 300)}`),
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const aborted = error instanceof Error && error.name === "AbortError";
      const retriable = aborted || error instanceof TypeError;
      if (!retriable || attempt === retries) {
        if (error && typeof error === "object" && "code" in error) throw error;
        throw upstreamUnavailable(service, error);
      }
      logger.warn("upstream request failed, retrying", {
        service,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(backoff(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw upstreamUnavailable(service, lastError);
}

function backoff(attempt: number): number {
  const base = Math.min(8_000, 400 * 2 ** attempt);
  return base + Math.random() * 250;
}
