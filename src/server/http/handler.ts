/**
 * Route-handler plumbing shared by every endpoint: request ids, structured
 * logging, latency metrics, body/query validation and a single place where
 * errors become responses.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodTypeAny } from "zod";

import { AppError, badRequest, toAppError, validationFailed } from "@/server/lib/errors";
import {
  logger,
  newRequestId,
  recordSpan,
  runWithRequestContext,
  type RequestContext,
} from "@/server/lib/logger";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type Handler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<unknown>;

/**
 * Wrap a route handler. Return plain data and it becomes `{ ok: true, data }`;
 * throw an AppError and it becomes a typed failure with the right status.
 */
export function route(name: string, handler: Handler) {
  return async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const requestId = newRequestId(request.headers.get("x-request-id"));
    const ctx: RequestContext = {
      requestId,
      route: name,
      startedAt: Date.now(),
    };

    return runWithRequestContext(ctx, async () => {
      try {
        const data = await handler(request, context);
        if (data instanceof NextResponse) return withRequestId(data, requestId);
        const durationMs = Date.now() - ctx.startedAt;
        recordSpan(`route:${name}`, durationMs, true);
        logger.info("request completed", { durationMs, status: 200 });
        return withRequestId(
          NextResponse.json<ApiSuccess<unknown>>({ ok: true, data, requestId }),
          requestId,
        );
      } catch (error) {
        const appError = toAppError(error);
        const durationMs = Date.now() - ctx.startedAt;
        recordSpan(`route:${name}`, durationMs, false);
        const level = appError.status >= 500 ? "error" : "warn";
        logger[level]("request failed", {
          durationMs,
          status: appError.status,
          code: appError.code,
          error: appError.cause ?? appError,
        });
        return withRequestId(
          NextResponse.json<ApiFailure>(
            {
              ok: false,
              error: {
                code: appError.code,
                message: appError.userMessage,
                details: appError.details,
              },
              requestId,
            },
            { status: appError.status },
          ),
          requestId,
        );
      }
    });
  };
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set("x-request-id", requestId);
  return response;
}

/** Parse and validate a JSON body. */
export async function readJson<S extends ZodTypeAny>(
  request: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Expected a JSON body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationFailed(flattenIssues(parsed.error));
  return parsed.data;
}

/** Parse and validate the query string. */
export function readQuery<S extends ZodTypeAny>(request: NextRequest, schema: S): z.infer<S> {
  const raw: Record<string, string | string[]> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    const existing = raw[key];
    if (existing === undefined) raw[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else raw[key] = [existing, value];
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationFailed(flattenIssues(parsed.error));
  return parsed.data;
}

export function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export { AppError };
