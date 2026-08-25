import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/server/providers/http";
import { collectMusicCatalogue, collectVideoCatalogue, providerStatus, searchLive } from "@/server/providers";
import { seedTitleRecords, seedTrackRecords } from "@/server/providers/seed";
import { resetEnvCache } from "@/server/config/env";

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe("provider HTTP client", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    mockFetch(() => new Response(JSON.stringify({ hello: "world" }), { status: 200 }));
    await expect(fetchJson<{ hello: string }>("https://x.test", { service: "Test" })).resolves.toEqual({
      hello: "world",
    });
  });

  it("retries a 500 and succeeds on a later attempt", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return calls < 3
        ? new Response("boom", { status: 500 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const result = await fetchJson("https://x.test", { service: "Test", retries: 3 });
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("gives up on a persistent 500 with an actionable error", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));
    await expect(fetchJson("https://x.test", { service: "Spotify", retries: 1 })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      status: 503,
    });
  });

  it("honours Retry-After on a 429 and then succeeds", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const promise = fetchJson("https://x.test", { service: "Test", retries: 2 });
    await vi.advanceTimersByTimeAsync(1200);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("surfaces a rate limit that never clears", async () => {
    mockFetch(() => new Response("slow down", { status: 429, headers: { "retry-after": "1" } }));
    const promise = fetchJson("https://x.test", { service: "Test", retries: 1 });
    const assertion = expect(promise).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it("soft-fails the statuses the caller nominates instead of throwing", async () => {
    mockFetch(() => new Response("not found", { status: 404 }));
    await expect(
      fetchJson("https://x.test", { service: "Test", softFail: [404] }),
    ).resolves.toBeNull();
  });

  it("treats a 4xx the caller did not nominate as an upstream failure", async () => {
    mockFetch(() => new Response("bad token", { status: 401 }));
    await expect(fetchJson("https://x.test", { service: "Test" })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
});

describe("provider selection", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    delete process.env.TMDB_API_KEY;
    resetEnvCache();
  });

  it("uses the seed catalogue when no credentials are configured", () => {
    resetEnvCache();
    expect(providerStatus()).toEqual({ music: "seed", video: "seed" });
  });

  it("returns the full offline catalogue without touching the network", async () => {
    resetEnvCache();
    const noNetwork = mockFetch(() => {
      throw new Error("network should not be used");
    });

    const music = await collectMusicCatalogue();
    const video = await collectVideoCatalogue();

    expect(music.source).toBe("seed");
    expect(music.records.length).toBe(seedTrackRecords().length);
    expect(video.records.length).toBe(seedTitleRecords().length);
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it("falls back to seed data when a configured provider is down", async () => {
    process.env.TMDB_API_KEY = "test-key";
    resetEnvCache();
    mockFetch(() => new Response("upstream on fire", { status: 500 }));

    const video = await collectVideoCatalogue();
    expect(video.source).toBe("seed");
    expect(video.records.length).toBeGreaterThan(0);
  });

  it("returns an empty widening set rather than failing the search", async () => {
    process.env.TMDB_API_KEY = "test-key";
    resetEnvCache();
    mockFetch(() => new Response("upstream on fire", { status: 500 }));

    await expect(searchLive("VIDEO", "anything", 5)).resolves.toEqual([]);
  });

  it("reports live providers once credentials exist", () => {
    process.env.SPOTIFY_CLIENT_ID = "id";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";
    process.env.TMDB_API_KEY = "key";
    resetEnvCache();
    expect(providerStatus()).toEqual({ music: "spotify", video: "tmdb" });
  });
});
