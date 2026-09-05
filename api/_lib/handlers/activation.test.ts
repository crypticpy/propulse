import { afterEach, describe, expect, it, vi } from "vitest";
import { handleActivationPota } from "./activation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("handleActivationPota - activator branch", () => {
  it("matches a row case-insensitively with the callsign suffix stripped", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        {
          spotId: 1,
          activator: "k5abc/p",
          reference: "US-1234",
          parkName: "Test Park",
          name: "Test Park",
          frequency: "14074",
          mode: "FT8",
          spotTime: "2026-09-05T02:54:51",
        },
        {
          spotId: 2,
          activator: "W1AW",
          reference: "US-5678",
          frequency: "7040",
          mode: "SSB",
          spotTime: "2026-09-05T02:50:00",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?activator=K5ABC", {
        headers: { "x-forwarded-for": "192.0.2.1" },
      }),
    );
    const payload = (await response.json()) as { spots: unknown[] };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "s-maxage=60, stale-while-revalidate=30",
    );
    expect(payload.spots).toHaveLength(1);
    expect(payload.spots[0]).toMatchObject({
      spotId: 1,
      activator: "k5abc/p",
      reference: "US-1234",
      parkName: "Test Park",
      name: "Test Park",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pota.app/spot/activator",
      expect.anything(),
    );
  });

  it("matches a prefix-form callsign without colliding on the DX prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        { spotId: 1, activator: "TI7/W1ABC", reference: "CR-0001" },
        { spotId: 2, activator: "TI7/K9XYZ", reference: "CR-0002" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?activator=TI7/W1ABC", {
        headers: { "x-forwarded-for": "192.0.2.1" },
      }),
    );
    const payload = (await response.json()) as { spots: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.spots).toHaveLength(1);
    expect(payload.spots[0]).toMatchObject({ spotId: 1, reference: "CR-0001" });
  });

  it("returns an empty spots array when no row matches the callsign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          { spotId: 1, activator: "W1AW", reference: "US-5678" },
        ]),
      ),
    );

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?activator=K5ABC", {
        headers: { "x-forwarded-for": "192.0.2.2" },
      }),
    );
    const payload = (await response.json()) as { spots: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.spots).toEqual([]);
  });

  it("passes through an upstream error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Missing Authentication Token" }), {
          status: 403,
        }),
      ),
    );

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?activator=K5ABC", {
        headers: { "x-forwarded-for": "192.0.2.3" },
      }),
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "POTA API returned 403" });
  });

  it("returns an empty spots array when the upstream body is not an array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)));

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?activator=K5ABC", {
        headers: { "x-forwarded-for": "192.0.2.4" },
      }),
    );
    const payload = (await response.json()) as { spots: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.spots).toEqual([]);
  });
});

describe("handleActivationPota - search branch", () => {
  it("keeps only park entries, splits the ref from the display name, and caps results at 10", async () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      type: "park",
      id: i,
      display: `JP-${String(i).padStart(4, "0")}  Park Number ${i}`,
      value: `JP-${String(i).padStart(4, "0")}`,
    }));
    entries.push({ type: "region", id: 999, display: "Japan", value: "JP" } as never);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(entries)));

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?search=Japan", {
        headers: { "x-forwarded-for": "192.0.2.5" },
      }),
    );
    const payload = (await response.json()) as {
      parks: { ref: string; name: string; location: string; grid: string; active: boolean }[];
    };

    expect(response.status).toBe(200);
    expect(payload.parks).toHaveLength(10);
    expect(payload.parks[0]).toEqual({
      ref: "JP-0000",
      name: "Park Number 0",
      location: "",
      grid: "",
      active: true,
    });
  });

  it("uses the raw display when it does not start with the ref", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          { type: "park", id: 1, display: "Some Other Label", value: "JP-0021" },
        ]),
      ),
    );

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?search=Yoshino", {
        headers: { "x-forwarded-for": "192.0.2.6" },
      }),
    );
    const payload = (await response.json()) as { parks: { name: string }[] };

    expect(payload.parks[0]?.name).toBe("Some Other Label");
  });

  it("returns an empty parks array when the upstream body is null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)));

    const response = await handleActivationPota(
      new Request("https://propulse.test/api/activation?search=nowhere", {
        headers: { "x-forwarded-for": "192.0.2.7" },
      }),
    );
    const payload = (await response.json()) as { parks: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.parks).toEqual([]);
  });

  it("calls the lookup endpoint with the encoded search term", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    await handleActivationPota(
      new Request("https://propulse.test/api/activation?search=Yoshino Kumano", {
        headers: { "x-forwarded-for": "192.0.2.8" },
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pota.app/lookup?search=Yoshino%20Kumano",
      expect.anything(),
    );
  });
});
