import { describe, expect, it, vi } from "vitest";
import {
  createPropagationModelClient,
  resolvePropagationModelMode,
} from "./modelClient";

describe("createPropagationModelClient", () => {
  it("resolves explicit shadow mode and fails closed without a URL", () => {
    expect(resolvePropagationModelMode("shadow", undefined, "https://model.test")).toBe(
      "shadow",
    );
    expect(resolvePropagationModelMode("active", undefined, "")).toBe("off");
    expect(resolvePropagationModelMode(undefined, "true", "https://model.test")).toBe(
      "active",
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
});
