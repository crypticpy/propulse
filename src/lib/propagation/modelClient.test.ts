import { describe, expect, it, vi } from "vitest";
import capabilitiesFixture from "../../../ml/fixtures/propagation_capabilities_v1.json";
import {
  createPropagationModelClient,
  propagationCapabilitiesAreValid,
  resolvePropagationModelMode,
} from "./modelClient";

describe("createPropagationModelClient", () => {
  it("resolves product modes, migrates legacy names, and fails closed without a URL", () => {
    expect(resolvePropagationModelMode("internal", undefined, "https://model.test")).toBe(
      "internal",
    );
    expect(resolvePropagationModelMode("released", undefined, "https://model.test")).toBe(
      "released",
    );
    expect(resolvePropagationModelMode("shadow", undefined, "https://model.test")).toBe(
      "internal",
    );
    expect(resolvePropagationModelMode("active", undefined, "")).toBe("off");
    expect(resolvePropagationModelMode("active", undefined, "https://model.test")).toBe(
      "released",
    );
    expect(resolvePropagationModelMode(undefined, "true", "https://model.test")).toBe(
      "internal",
    );
    expect(resolvePropagationModelMode("invalid", undefined, "https://model.test")).toBe(
      "off",
    );
  });

  it("sends only the explicit versioned request envelope", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ model_version: "v4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createPropagationModelClient("http://localhost:8000/", fetcher);
    const request = {
      origin_grid4: "EM10",
      issue_time: "2026-07-12T00:00:00Z",
      valid_time: "2026-07-12T00:00:00Z",
      band: "20m",
      mode: "WSPR",
      declared_power_watts: 5,
      features: { target_grid4: "IO91", values: { dist_km: 7900 } },
    };

    await client.path(request);

    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:8000/v1/propagation/path",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
  });

  it("surfaces a service detail without exposing the request body", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "no approved model bundle is loaded" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createPropagationModelClient("http://localhost:8000", fetcher);

    await expect(client.health()).rejects.toThrow("no approved model bundle is loaded");
  });

  it("accepts the shared capability contract and rejects malformed horizons", async () => {
    expect(propagationCapabilitiesAreValid(capabilitiesFixture)).toBe(true);
    expect(propagationCapabilitiesAreValid({
      ...capabilitiesFixture,
      modes: {
        ...capabilitiesFixture.modes,
        futurecast: {
          ...capabilitiesFixture.modes.futurecast,
          released_eligible: true,
          released_horizons_hours: [12, 3],
        },
      },
    })).toBe(false);

    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(capabilitiesFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createPropagationModelClient("http://localhost:8000", fetcher);
    await expect(client.capabilities()).resolves.toEqual(capabilitiesFixture);
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:8000/v1/propagation/capabilities",
      { signal: undefined },
    );
  });
});
