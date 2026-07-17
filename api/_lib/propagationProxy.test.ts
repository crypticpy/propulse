import { afterEach, describe, expect, it, vi } from "vitest";
import capabilitiesFixture from "../../ml/fixtures/propagation_capabilities_v1.json";
import {
  handlePropagationProxy,
  type PropagationProxyDependencies,
} from "./propagationProxy";

const SERVICE_TOKEN = "service-token-that-is-at-least-32-characters";

function pathRequest() {
  return {
    origin_grid4: "EM10",
    issue_time: "2026-07-16T12:00:00Z",
    valid_time: "2026-07-16T12:00:00Z",
    band: "20m",
    mode: "WSPR",
    declared_power_watts: 5,
    features: {
      target_grid4: "IO91",
      values: { dist_km: 7900, recent_path_count: null },
    },
  };
}

function pathResponse(overrides: Record<string, unknown> = {}) {
  return {
    model_version: "propagation-v4.2-a6-retrospective-internal-50000000",
    feature_contract: "station-chain-v1",
    issue_time: "2026-07-16T12:00:00+00:00",
    valid_time: "2026-07-16T12:00:00+00:00",
    band: "20m",
    mode: "WSPR",
    target_grid4: "IO91",
    core_probability: 0.42,
    personalized_probability: 0.55,
    confidence: 0.75,
    ood_flags: ["recent_network_stale_physics_fallback"],
    data_freshness: {},
    top_factors: ["dist_km"],
    assumptions: [],
    profile: "physics",
    ...overrides,
  };
}

function request(
  route: string,
  init: RequestInit = {},
): Request {
  return new Request(`https://app.propulse.test/api/propagation/${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "192.0.2.15",
      ...init.headers,
    },
    body: JSON.stringify(pathRequest()),
    ...init,
  });
}

function dependencies(
  fetcher: PropagationProxyDependencies["fetcher"],
  overrides: Partial<PropagationProxyDependencies> = {},
): Partial<PropagationProxyDependencies> {
  return {
    authenticate: vi.fn(async () => ({ id: "registered-user" })),
    fetcher,
    rateLimiter: vi.fn(() => ({ success: true, remaining: 10, reset: 60 })),
    serviceConfig: () => ({
      baseUrl: "https://inference.propulse.test",
      token: SERVICE_TOKEN,
    }),
    traceId: () => "00000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("propagation proxy", () => {
  it("authenticates a same-origin path call and forwards only service metadata", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(pathResponse()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const authenticate = vi.fn(async () => ({ id: "private-user-id" }));
    const response = await handlePropagationProxy(
      request("path", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer browser-jwt",
          Origin: "https://app.propulse.test",
          "X-Forwarded-For": "192.0.2.15",
        },
      }),
      "path",
      dependencies(fetcher, { authenticate }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Propulse-Trace-Id")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(authenticate).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://inference.propulse.test/v1/propagation/path");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        "Content-Type": "application/json",
        "X-Propulse-Trace-Id": "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(JSON.stringify(init?.headers)).not.toContain("private-user-id");
    expect(JSON.stringify(init?.headers)).not.toContain("browser-jwt");
    await expect(response.json()).resolves.toEqual(pathResponse());
  });

  it("rejects cross-origin and unauthenticated calls before upstream access", async () => {
    const fetcher = vi.fn();
    const crossOrigin = await handlePropagationProxy(
      request("path", { headers: { Origin: "https://attacker.test" } }),
      "path",
      dependencies(fetcher),
    );
    expect(crossOrigin.status).toBe(403);

    const crossRealmAuthFailure = {
      status: 401,
      headers: new Headers(),
    } as unknown as Response;
    const unauthorized = await handlePropagationProxy(
      request("path"),
      "path",
      dependencies(fetcher, {
        // Vercel Edge responses may not share the caller's Response prototype.
        authenticate: async () => crossRealmAuthFailure,
      }),
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when production Supabase authentication is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    const fetcher = vi.fn();
    const response = await handlePropagationProxy(
      request("path"),
      "path",
      {
        fetcher,
        rateLimiter: () => ({ success: true, remaining: 10, reset: 60 }),
        serviceConfig: () => ({
          baseUrl: "https://inference.propulse.test",
          token: SERVICE_TOKEN,
        }),
        traceId: () => "00000000-0000-4000-8000-000000000001",
      },
    );

    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enforces per-user throttling before reading or forwarding a body", async () => {
    const fetcher = vi.fn();
    const rateLimiter = vi.fn((endpoint: string) => ({
      success: !endpoint.endsWith("/user"),
      remaining: 0,
      reset: 17,
    }));
    const response = await handlePropagationProxy(
      request("path"),
      "path",
      dependencies(fetcher, { rateLimiter }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies and surfaces with more than 4,096 cells", async () => {
    const fetcher = vi.fn();
    const oversized = await handlePropagationProxy(
      request("path", { body: "x".repeat(128 * 1024 + 1) }),
      "path",
      dependencies(fetcher),
    );
    expect(oversized.status).toBe(413);

    const base = pathRequest();
    const tooManyCells = Array.from({ length: 4097 }, (_, index) => ({
      target_grid4: index % 2 === 0 ? "IO91" : "EM10",
      values: { dist_km: 7900 },
    }));
    const invalidSurface = await handlePropagationProxy(
      request("surface", {
        body: JSON.stringify({
          ...base,
          features: undefined,
          cells: tooManyCells,
        }),
      }),
      "surface",
      dependencies(fetcher),
    );
    expect(invalidSurface.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects response/request mismatches and malformed service responses", async () => {
    const mismatched = vi.fn(async () => new Response(JSON.stringify(
      pathResponse({ target_grid4: "FN31" }),
    ), { status: 200 }));
    const mismatchResponse = await handlePropagationProxy(
      request("path"),
      "path",
      dependencies(mismatched),
    );
    expect(mismatchResponse.status).toBe(502);

    const malformed = vi.fn(async () => new Response("not-json", { status: 200 }));
    const malformedResponse = await handlePropagationProxy(
      request("path"),
      "path",
      dependencies(malformed),
    );
    expect(malformedResponse.status).toBe(502);
  });

  it("maps timeouts and sanitizes upstream authentication failures", async () => {
    const timeout = vi.fn(async () => {
      const crossRealmTimeout = Object.assign(Object.create(null), {
        name: "TimeoutError",
      });
      throw crossRealmTimeout;
    });
    const timeoutResponse = await handlePropagationProxy(
      request("path"),
      "path",
      dependencies(timeout),
    );
    expect(timeoutResponse.status).toBe(504);

    const authFailure = vi.fn(async () => new Response(JSON.stringify({
      detail: "service authorization required",
    }), { status: 401 }));
    const authResponse = await handlePropagationProxy(
      request("path"),
      "path",
      dependencies(authFailure),
    );
    expect(authResponse.status).toBe(502);
    await expect(authResponse.json()).resolves.toEqual({
      error: "Propagation service unavailable",
    });
  });

  it("validates authenticated metadata responses and method boundaries", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify(capabilitiesFixture),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const response = await handlePropagationProxy(
      request("capabilities", { method: "GET", body: null }),
      "capabilities",
      dependencies(fetcher),
    );
    expect(response.status).toBe(200);

    const wrongMethod = await handlePropagationProxy(
      request("capabilities"),
      "capabilities",
      dependencies(fetcher),
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("GET");
  });
});
