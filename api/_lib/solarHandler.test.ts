import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOLAR_ROUTES } from "./solarRoutes";
import { getSolarSourcePolicy } from "../../src/lib/solar/sourcePolicies";
import {
  alerts,
  cme,
  drapText,
  dst,
  dualXray,
  forecastText,
  latestXray,
  magnetometerNewestFirst,
  mixedProtons,
  newestFirstFlux,
  newestFirstProbabilities,
  reversedKp,
  scales,
  sunspots,
  windMag,
  windPlasma,
} from "../../src/test/fixtures/solar/providerFixtures";

const DATA_ROUTES = [
  "/api/solar/alerts",
  "/api/solar/cme",
  "/api/solar/drap",
  "/api/solar/dst",
  "/api/solar/flux-forecast",
  "/api/solar/flux",
  "/api/solar/k-index",
  "/api/solar/magnetometer",
  "/api/solar/probabilities",
  "/api/solar/protons",
  "/api/solar/scales",
  "/api/solar/sunspots",
  "/api/solar/wind-mag",
  "/api/solar/wind-plasma",
  "/api/solar/xray-latest",
  "/api/solar/xray",
] as const;

function upstreamResponse(input: string | URL | Request): Response {
  const url = String(input instanceof Request ? input.url : input);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  if (url.includes("noaa-planetary-k-index-forecast")) return json(reversedKp);
  if (url.includes("f107_cm_flux")) return json(newestFirstFlux);
  if (url.includes("solar_probabilities")) return json(newestFirstProbabilities);
  if (url.includes("solar-cycle/sunspots")) return json(sunspots);
  if (url.includes("rtsw_mag_1m") || url.includes("mag-1-day")) return json(magnetometerNewestFirst);
  if (url.includes("integral-protons")) return json(mixedProtons);
  if (url.includes("xrays-6-hour")) return json(dualXray);
  if (url.includes("kyoto-dst")) return json(dst);
  if (url.includes("drap_global_frequencies")) {
    return new Response(drapText, { headers: { "Content-Type": "text/plain" } });
  }
  if (url.includes("3-day-solar-geomag")) {
    return new Response(forecastText, { headers: { "Content-Type": "text/plain" } });
  }
  if (url.includes("DONKI/CMEAnalysis")) return json(cme);
  if (url.includes("noaa-scales")) return json(scales);
  if (url.includes("products/alerts")) return json(alerts);
  if (url.includes("xray-flares-latest")) return json(latestXray);
  if (url.includes("solar-wind-mag-field")) return json(windMag);
  if (url.includes("solar-wind-speed")) return json(windPlasma);
  if (url.includes("products/animations")) {
    return json([
      { url: "/images/animations/d-rap/global/frame-1.png", time_tag: "2026-07-15T18:40:00Z" },
      { url: "/images/animations/d-rap/global/frame-2.png", time_tag: "2026-07-15T18:41:00Z" },
    ]);
  }
  if (/\.(?:png|jpg|jpeg)(?:\?|$)/i.test(url) || url.includes("latest_512_HMIIC")) {
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": "4",
        "Last-Modified": "Wed, 15 Jul 2026 18:40:00 GMT",
      },
    });
  }
  throw new Error(`Unhandled fixture URL: ${url}`);
}

describe("solar edge route contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(upstreamResponse));
  });

  it.each(Object.keys(SOLAR_ROUTES))("supports OPTIONS and rejects POST for %s", async (path) => {
    const handler = SOLAR_ROUTES[path];
    const options = await handler(new Request(`https://propulse.test${path}`, { method: "OPTIONS" }));
    const post = await handler(new Request(`https://propulse.test${path}`, { method: "POST" }));
    expect(options.status).toBe(204);
    expect(post.status).toBe(405);
  });

  it.each(DATA_ROUTES)("returns a bounded versioned JSON envelope for %s", async (path) => {
    const response = await SOLAR_ROUTES[path](new Request(`https://propulse.test${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("stale-if-error");
    expect(response.headers.get("x-solar-schema")).toBe("1");
    const body = await response.json();
    expect(body).toMatchObject({
      schemaVersion: 1,
      provider: expect.any(String),
      product: expect.any(String),
      observedAt: expect.any(String),
      fetchedAt: expect.any(String),
      sourceUrl: expect.any(String),
    });
    const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
    expect(bytes).toBeLessThanOrEqual(getSolarSourcePolicy(body.sourceId).maxBytes);
  });

  it("keeps the exact flux and flux-forecast routes independent", async () => {
    const fluxResponse = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux"),
    );
    const forecastResponse = await SOLAR_ROUTES["/api/solar/flux-forecast"](
      new Request("https://propulse.test/api/solar/flux-forecast"),
    );
    expect((await fluxResponse.json()).sourceId).toBe("noaa-solar-flux");
    expect((await forecastResponse.json()).sourceId).toBe("noaa-flux-forecast");
  });

  it("returns image media for stable image and immutable frame routes", async () => {
    const requests = [
      ["/api/solar/image", "?product=drap-global"],
      ["/api/solar/frame", "?product=drap-global&file=frame-1.png"],
    ] as const;
    for (const [path, query] of requests) {
      const response = await SOLAR_ROUTES[path](
        new Request(`https://propulse.test${path}${query}`),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^image\//);
      expect(response.headers.get("cache-control")).toContain("stale-if-error");
    }
  });

  it("returns a bounded, same-origin animation manifest", async () => {
    const response = await SOLAR_ROUTES["/api/solar/animation"](
      new Request("https://propulse.test/api/solar/animation?product=drap-global"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("stale-if-error");
    const body = await response.json();
    expect(body.frames).toHaveLength(2);
    expect(body.frames[0].url).toMatch(/^\/api\/solar\/frame\?/);
  });

  it("maps malformed provider content to a typed non-cacheable failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response("<html>down</html>", { headers: { "Content-Type": "text/html" } })),
    );
    const response = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux"),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).error.code).toBe("WRONG_CONTENT_TYPE");
  });

  it.each([
    [400, 502, "UPSTREAM_REJECTED", false],
    [404, 502, "UPSTREAM_REJECTED", false],
    [429, 429, "RATE_LIMITED", true],
    [500, 502, "UPSTREAM_REJECTED", true],
    [503, 502, "UPSTREAM_REJECTED", true],
  ])(
    "classifies provider HTTP %i without caching the error",
    async (upstreamStatus, expectedStatus, code, retryable) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Response("provider failure", { status: upstreamStatus })),
      );
      const response = await SOLAR_ROUTES["/api/solar/flux"](
        new Request("https://propulse.test/api/solar/flux"),
      );
      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toMatchObject({
        error: { code, retryable, upstreamStatus },
      });
    },
  );

  it("classifies network failure and invalid JSON separately", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const network = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux"),
    );
    expect(network.status).toBe(503);
    expect((await network.json()).error.code).toBe("NETWORK_ERROR");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{not-json", { headers: { "Content-Type": "application/json" } }),
      ),
    );
    const invalid = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux"),
    );
    expect(invalid.status).toBe(502);
    expect((await invalid.json()).error.code).toBe("SCHEMA_INVALID");
  });

  it("enforces the provider payload budget before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("[]", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "999999999",
          },
        }),
      ),
    );
    const response = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux"),
    );
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns a typed timeout when the request deadline aborts the provider", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      ),
    );
    const pending = SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux"),
    );
    await vi.advanceTimersByTimeAsync(getSolarSourcePolicy("noaa-solar-flux").requestDeadlineMs);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("TIMEOUT");
  });

  it("uses the normalized fallback when the primary magnetometer product fails", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("rtsw_mag_1m")) {
        return Promise.resolve(new Response("down", { status: 503 }));
      }
      return Promise.resolve(upstreamResponse(input));
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await SOLAR_ROUTES["/api/solar/magnetometer"](
      new Request("https://propulse.test/api/solar/magnetometer"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).sourceId).toBe("noaa-magnetometer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the primary error classification when both magnetometer products fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("down", { status: 503 })),
    );
    const response = await SOLAR_ROUTES["/api/solar/magnetometer"](
      new Request("https://propulse.test/api/solar/magnetometer"),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "UPSTREAM_REJECTED", upstreamStatus: 503 },
    });
  });

  it("reflects only approved origins", async () => {
    const sameOrigin = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux", {
        headers: { Origin: "https://propulse.test" },
      }),
    );
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBe(
      "https://propulse.test",
    );
    const rejected = await SOLAR_ROUTES["/api/solar/flux"](
      new Request("https://propulse.test/api/solar/flux", {
        headers: { Origin: "https://attacker.example" },
      }),
    );
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects image HTML and provider 404s as typed image failures", async () => {
    for (const providerResponse of [
      new Response("<html>fallback</html>", {
        headers: { "Content-Type": "text/html" },
      }),
      new Response("missing", { status: 404 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse));
      const response = await SOLAR_ROUTES["/api/solar/image"](
        new Request("https://propulse.test/api/solar/image?product=sunspot-hmi"),
      );
      expect(response.status).not.toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("times out an unavailable image provider without caching the failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      ),
    );
    const pending = SOLAR_ROUTES["/api/solar/image"](
      new Request("https://propulse.test/api/solar/image?product=sunspot-hmi"),
    );
    await vi.advanceTimersByTimeAsync(8_000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toContain("no-store");
    vi.useRealTimers();
  });

  it("rejects oversized and malformed animation manifests", async () => {
    for (const providerResponse of [
      new Response("[]", {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "999999999",
        },
      }),
      new Response("<html>fallback</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse));
      const response = await SOLAR_ROUTES["/api/solar/animation"](
        new Request("https://propulse.test/api/solar/animation?product=drap-global"),
      );
      expect(response.status).toBe(502);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await response.json()).error.code).toBe("ANIMATION_UNAVAILABLE");
    }
  });
});
