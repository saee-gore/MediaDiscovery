/**
 * Structured JSON logging with request correlation.
 *
 * Every API request gets a request id (from `x-request-id` when a proxy already
 * assigned one, otherwise generated) that is echoed back in the response header
 * and attached to every log line and metric emitted while handling it.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { getEnv } from "@/server/config/env";
import { createId } from "@/server/lib/id";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface RequestContext {
  requestId: string;
  route?: string;
  userId?: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function newRequestId(incoming?: string | null): string {
  return incoming && incoming.length <= 128 ? incoming : createId("req");
}

/** Attach the resolved user to the active request context, for later log lines. */
export function tagRequestUser(userId: string | undefined): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}

function threshold(): number {
  try {
    return LEVEL_ORDER[getEnv().LOG_LEVEL];
  } catch {
    return LEVEL_ORDER.info;
  }
}

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < threshold()) return;
  const context = storage.getStore();
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    requestId: context?.requestId,
    userId: context?.userId,
    route: context?.route,
    ...fields,
  };
  let serialised: string;
  try {
    serialised = JSON.stringify(line, replacer);
  } catch {
    // Circular structure somewhere in the payload — never lose the log line.
    serialised = JSON.stringify({ ts: line.ts, level, msg: message, serialisationFailed: true });
  }
  if (level === "error") console.error(serialised);
  else if (level === "warn") console.warn(serialised);
  else console.log(serialised);
}

/**
 * Serialise errors with their `code` and their `cause` chain.
 *
 * The chain is where the diagnosis lives: a database driver reports "Failed
 * query: …" and buries ECONNREFUSED underneath. JSON.stringify re-enters this
 * replacer for nested values, so returning the raw `cause` expands it too.
 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    const aggregated =
      value instanceof AggregateError && Array.isArray(value.errors)
        ? value.errors.slice(0, 2)
        : undefined;
    return {
      name: value.name,
      message: value.message,
      code: (value as { code?: unknown }).code,
      cause: value.cause,
      errors: aggregated,
      stack: value.stack,
    };
  }
  if (value === undefined) return undefined;
  return value;
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};

/** Time an async span and log its duration; failures are logged and rethrown. */
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  fields?: Record<string, unknown>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - started;
    emit("debug", `${name} ok`, { ...fields, span: name, durationMs });
    recordSpan(name, durationMs, true);
    return result;
  } catch (error) {
    const durationMs = Date.now() - started;
    emit("warn", `${name} failed`, { ...fields, span: name, durationMs, error });
    recordSpan(name, durationMs, false);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Lightweight in-process metrics
// ---------------------------------------------------------------------------

export interface SpanStats {
  count: number;
  failures: number;
  totalMs: number;
  maxMs: number;
  p50: number;
  p95: number;
}

const MAX_SAMPLES = 200;
const samples = new Map<string, { durations: number[]; count: number; failures: number; totalMs: number; maxMs: number }>();

export function recordSpan(name: string, durationMs: number, ok: boolean): void {
  let entry = samples.get(name);
  if (!entry) {
    entry = { durations: [], count: 0, failures: 0, totalMs: 0, maxMs: 0 };
    samples.set(name, entry);
  }
  entry.count += 1;
  if (!ok) entry.failures += 1;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);
  entry.durations.push(durationMs);
  if (entry.durations.length > MAX_SAMPLES) entry.durations.shift();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

export function getMetrics(): Record<string, SpanStats> {
  const out: Record<string, SpanStats> = {};
  for (const [name, entry] of samples) {
    const sorted = [...entry.durations].sort((a, b) => a - b);
    out[name] = {
      count: entry.count,
      failures: entry.failures,
      totalMs: Math.round(entry.totalMs),
      maxMs: Math.round(entry.maxMs),
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
    };
  }
  return out;
}

export function resetMetrics(): void {
  samples.clear();
}
