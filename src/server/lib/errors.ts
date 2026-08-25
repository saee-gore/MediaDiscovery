/**
 * Error taxonomy.
 *
 * Every failure the API can return is one of these. Each carries an HTTP
 * status, a stable machine-readable `code` the frontend can branch on, and a
 * message written for a human reading a toast — not a stack trace.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "LLM_UNAVAILABLE"
  | "LLM_INVALID_OUTPUT"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_NOT_READY"
  | "VECTOR_UNAVAILABLE"
  | "EMBEDDINGS_MISSING"
  | "NO_RESULTS"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Safe to show the user verbatim. */
  readonly userMessage: string;

  constructor(options: {
    code: ErrorCode;
    status: number;
    message: string;
    userMessage?: string;
    details?: unknown;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.userMessage = options.userMessage ?? options.message;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError({ code: "BAD_REQUEST", status: 400, message, details });

export const validationFailed = (details: unknown) =>
  new AppError({
    code: "VALIDATION_FAILED",
    status: 422,
    message: "Request failed validation.",
    userMessage: "Some of those values weren't quite right. Check the highlighted fields.",
    details,
  });

export const unauthenticated = (message = "Sign in to continue.") =>
  new AppError({ code: "UNAUTHENTICATED", status: 401, message });

export const forbidden = (message = "You don't have access to that.") =>
  new AppError({ code: "FORBIDDEN", status: 403, message });

export const notFound = (what = "That") =>
  new AppError({ code: "NOT_FOUND", status: 404, message: `${what} could not be found.` });

export const conflict = (message: string) =>
  new AppError({ code: "CONFLICT", status: 409, message });

export const duplicate = (message: string) =>
  new AppError({ code: "DUPLICATE", status: 409, message });

export const rateLimited = (message = "Too many requests. Slow down a moment.") =>
  new AppError({ code: "RATE_LIMITED", status: 429, message });

export const upstreamUnavailable = (service: string, cause?: unknown) =>
  new AppError({
    code: "UPSTREAM_UNAVAILABLE",
    status: 503,
    message: `${service} is unavailable.`,
    userMessage: `We couldn't reach ${service} just now. Showing what we have cached instead.`,
    cause,
  });

export const llmUnavailable = (cause?: unknown) =>
  new AppError({
    code: "LLM_UNAVAILABLE",
    status: 503,
    message: "The local model is unreachable.",
    userMessage:
      "The recommendation model isn't responding. Check that Ollama is running, then try again.",
    cause,
  });

export const llmInvalidOutput = (details?: unknown) =>
  new AppError({
    code: "LLM_INVALID_OUTPUT",
    status: 502,
    message: "The model returned output that failed validation.",
    userMessage: "We had trouble interpreting that request. Try rephrasing it.",
    details,
  });

export const vectorUnavailable = (cause?: unknown) =>
  new AppError({
    code: "VECTOR_UNAVAILABLE",
    status: 503,
    message: "Semantic search is unavailable.",
    userMessage: "Semantic search is temporarily unavailable, falling back to keyword matching.",
    cause,
  });

export const databaseUnavailable = (cause?: unknown) =>
  new AppError({
    code: "DATABASE_UNAVAILABLE",
    status: 503,
    message: "The database is unreachable.",
    userMessage:
      "Can't reach the database. Start Postgres (`brew services start postgresql@16`), then try again.",
    cause,
  });

export const databaseNotReady = (detail: string, cause?: unknown) =>
  new AppError({
    code: "DATABASE_NOT_READY",
    status: 503,
    message: `The database is not ready: ${detail}`,
    userMessage: detail,
    cause,
  });

export const internal = (cause?: unknown) =>
  new AppError({
    code: "INTERNAL",
    status: 500,
    message: "Something went wrong.",
    userMessage: "Something went wrong on our side. Please try again.",
    cause,
  });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Coerce anything thrown into an AppError without losing the original. */
/**
 * Walk the `cause` chain.
 *
 * Drivers wrap failures: Drizzle reports "Failed query: select …" and hides the
 * error that actually explains it — ECONNREFUSED, or a missing table — one or
 * two levels down. Without unwrapping, every infrastructure problem looks like
 * the same generic 500.
 */
export function rootCause(error: unknown, depth = 0): unknown {
  if (depth >= 6) return error;
  if (error instanceof Error && error.cause) return rootCause(error.cause, depth + 1);
  return error;
}

function codeOf(value: unknown): string | undefined {
  if (value && typeof value === "object" && "code" in value) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * Postgres SQLSTATEs worth translating. Each of these has an obvious fix, and
 * saying it is far more useful than "something went wrong".
 */
const PG_MESSAGES: Record<string, string> = {
  "42P01":
    "The database has no tables yet. Run `npm run db:migrate` (or `npm run setup`) and try again.",
  "42703":
    "The database is missing a column this build expects, which means a migration has not been " +
    "applied. Run `npm run db:migrate` and try again.",
  "3F000":
    "The database schema is missing. Run `npm run db:migrate` (or `npm run setup`) and try again.",
  "3D000":
    "That database does not exist. Create it with `createdb -O curated curated`.",
  "28P01": "The database rejected those credentials. Check DATABASE_URL in your .env.",
  "28000": "The database rejected the connection. Check DATABASE_URL in your .env.",
  "42704":
    "The pgvector extension is missing. Run `CREATE EXTENSION vector` on this database, or install pgvector.",
  "58P01":
    "The pgvector extension is not installed on this Postgres server. See the README for how to build it.",
  "53300": "The database is out of connections. Wait a moment and try again.",
};

/** Coerce anything thrown into an AppError without losing the original. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const root = rootCause(error);
  // pg-pool raises an AggregateError whose entries carry the real code.
  const aggregated =
    root instanceof AggregateError && Array.isArray(root.errors) ? root.errors[0] : undefined;
  const code = codeOf(root) ?? codeOf(aggregated) ?? codeOf(error);

  const text = [
    error instanceof Error ? error.message : String(error ?? ""),
    root instanceof Error ? root.message : "",
    aggregated instanceof Error ? aggregated.message : "",
  ]
    .join(" ")
    .toLowerCase();

  // Ollama listens on 11434; anything else refusing a connection is the database,
  // since provider calls are wrapped by their own client.
  // Node attaches a `code`, but errors that have been re-thrown or stringified
  // along the way only carry it in the message. Check both.
  const refused =
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    text.includes("econnrefused") ||
    text.includes("enotfound");
  if (refused && text.includes("11434")) return llmUnavailable(error);
  if (refused) return databaseUnavailable(error);

  if (code && PG_MESSAGES[code]) return databaseNotReady(PG_MESSAGES[code], error);

  if (text.includes('relation "') && text.includes("does not exist")) {
    return databaseNotReady(PG_MESSAGES["42P01"], error);
  }
  if (text.includes('type "vector" does not exist')) {
    return databaseNotReady(PG_MESSAGES["58P01"], error);
  }

  if (text.includes("fetch failed")) {
    return new AppError({
      code: "UPSTREAM_UNAVAILABLE",
      status: 503,
      message: error instanceof Error ? error.message : String(error),
      userMessage: "A service we depend on is unreachable right now.",
      cause: error,
    });
  }

  return internal(error);
}
