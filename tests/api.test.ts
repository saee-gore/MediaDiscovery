import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

import { readJson, readQuery, route } from "@/server/http/handler";
import { badRequest, duplicate, notFound, toAppError, unauthenticated } from "@/server/lib/errors";
import { getMetrics, resetMetrics } from "@/server/lib/logger";

const request = (url = "https://app.test/api/x", init?: RequestInit) =>
  new NextRequest(new Request(url, init));
const noParams = { params: Promise.resolve({} as Record<string, string>) };

describe("route wrapper", () => {
  it("wraps a return value in a success envelope with a request id", async () => {
    const handler = route("test.ok", async () => ({ hello: "world" }));
    const response = await handler(request(), noParams);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ hello: "world" });
    expect(body.requestId).toBeTruthy();
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("echoes an inbound request id so traces join up across services", async () => {
    const handler = route("test.trace", async () => ({}));
    const response = await handler(
      request("https://app.test/api/x", { headers: { "x-request-id": "trace-123" } }),
      noParams,
    );
    expect(response.headers.get("x-request-id")).toBe("trace-123");
  });

  it("maps each error type to its status and stable code", async () => {
    const cases = [
      { error: badRequest("nope"), status: 400, code: "BAD_REQUEST" },
      { error: unauthenticated(), status: 401, code: "UNAUTHENTICATED" },
      { error: notFound("That playlist"), status: 404, code: "NOT_FOUND" },
      { error: duplicate("already there"), status: 409, code: "DUPLICATE" },
    ];

    for (const testCase of cases) {
      const handler = route("test.error", async () => {
        throw testCase.error;
      });
      const response = await handler(request(), noParams);
      expect(response.status).toBe(testCase.status);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(testCase.code);
      expect(typeof body.error.message).toBe("string");
    }
  });

  it("never leaks an internal error message to the client", async () => {
    const handler = route("test.boom", async () => {
      throw new Error("connection string postgres://user:hunter2@db/app failed");
    });
    const response = await handler(request(), noParams);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("records latency and failures per route", async () => {
    resetMetrics();
    const ok = route("test.metric", async () => ({}));
    const bad = route("test.metric", async () => {
      throw notFound("thing");
    });
    await ok(request(), noParams);
    await ok(request(), noParams);
    await bad(request(), noParams);

    const metrics = getMetrics();
    expect(metrics["route:test.metric"].count).toBe(3);
    expect(metrics["route:test.metric"].failures).toBe(1);
  });
});

describe("request validation", () => {
  const bodySchema = z.object({ name: z.string().min(1), count: z.number().int().optional() });

  it("returns the parsed body when it is valid", async () => {
    const parsed = await readJson(
      request("https://app.test/api/x", {
        method: "POST",
        body: JSON.stringify({ name: "Focus Mix", count: 3 }),
      }),
      bodySchema,
    );
    expect(parsed).toEqual({ name: "Focus Mix", count: 3 });
  });

  it("reports which field failed, per field", async () => {
    const failure = await readJson(
      request("https://app.test/api/x", { method: "POST", body: JSON.stringify({ name: "" }) }),
      bodySchema,
    ).catch((error) => error);

    expect(failure.code).toBe("VALIDATION_FAILED");
    expect(failure.status).toBe(422);
    expect(failure.details).toHaveProperty("name");
  });

  it("rejects a body that is not JSON at all", async () => {
    const failure = await readJson(
      request("https://app.test/api/x", { method: "POST", body: "not json" }),
      bodySchema,
    ).catch((error) => error);
    expect(failure.code).toBe("BAD_REQUEST");
  });

  it("coerces and clamps query-string numbers", () => {
    const schema = z.object({
      limit: z
        .string()
        .optional()
        .transform((value) => Math.min(50, Math.max(1, Number(value ?? 20) || 20))),
    });
    expect(readQuery(request("https://app.test/api/x?limit=5"), schema)).toEqual({ limit: 5 });
    expect(readQuery(request("https://app.test/api/x?limit=9999"), schema)).toEqual({ limit: 50 });
    expect(readQuery(request("https://app.test/api/x"), schema)).toEqual({ limit: 20 });
  });
});

describe("error coercion", () => {
  it("recognises an unreachable Ollama by its connection error", () => {
    const error = toAppError(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    expect(error.code).toBe("LLM_UNAVAILABLE");
    expect(error.userMessage).toMatch(/Ollama/i);
  });

  it("recognises a failed upstream fetch", () => {
    expect(toAppError(new Error("fetch failed")).code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("passes an AppError through untouched", () => {
    const original = notFound("That track");
    expect(toAppError(original)).toBe(original);
  });

  it("wraps anything else as an internal error", () => {
    expect(toAppError("just a string").code).toBe("INTERNAL");
    expect(toAppError(undefined).status).toBe(500);
  });
});
