import type { ApiEnvelope } from "@/lib/types";

/**
 * Typed client for the API envelope.
 *
 * Every endpoint answers `{ ok, data | error, requestId }`, so unwrapping and
 * error translation belong in one place. Components get either the data or an
 * `ApiError` carrying a message that is already safe to show.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(options: {
    code: string;
    status: number;
    message: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
  }

  /** Per-field messages from a 422, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    return this.details && typeof this.details === "object"
      ? (this.details as Record<string, string>)
      : {};
  }
}

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      credentials: "same-origin",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError({
      code: "NETWORK",
      status: 0,
      message: "Couldn't reach the server. Check your connection and try again.",
    });
  }

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }

  if (!body) {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      status: response.status,
      message: "The server sent back something unexpected.",
    });
  }

  if (!body.ok) {
    throw new ApiError({
      code: body.error.code,
      status: response.status,
      message: body.error.message,
      details: body.error.details,
      requestId: body.requestId,
    });
  }

  return body.data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body), signal }),
  del: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "DELETE", signal }),
};

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
