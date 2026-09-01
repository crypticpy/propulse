import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPSKReporterSpots } from "./pskreporter";
import { fetchRBNSpots } from "./rbn";

const clients = [
  {
    name: "PSKReporter",
    fetchSpots: () => fetchPSKReporterSpots(),
  },
  {
    name: "RBN",
    fetchSpots: () => fetchRBNSpots(),
  },
];

afterEach(() => vi.unstubAllGlobals());

describe.each(clients)("$name spot client failures", ({ fetchSpots }) => {
  it("rejects transport failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));

    await expect(fetchSpots()).rejects.toThrow("offline");
  });

  it("rejects non-success HTTP responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream down", { status: 503 })),
    );

    await expect(fetchSpots()).rejects.toThrow(/HTTP 503/);
  });

  it("rejects malformed success payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
      ),
    );

    await expect(fetchSpots()).rejects.toThrow(/unexpected/i);
  });

  it("rejects the production unavailable envelope even though it is HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              spots: [],
              meta: { status: "unavailable" },
            }),
            { status: 200 },
          ),
      ),
    );

    await expect(fetchSpots()).rejects.toThrow(/unavailable/i);
  });

  it("preserves a legitimate empty successful snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ spots: [], meta: { status: "ok" } }),
            { status: 200 },
          ),
      ),
    );

    await expect(fetchSpots()).resolves.toEqual([]);
  });
});

describe("PSKReporter XML snapshots", () => {
  it("rejects well-formed XML with the wrong root", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<error>feed unavailable</error>", { status: 200 }),
      ),
    );

    await expect(fetchPSKReporterSpots()).rejects.toThrow(
      /unexpected XML root/i,
    );
  });

  it("accepts an empty snapshot with the expected root", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response('<?xml version="1.0"?><receptionReports />', {
            status: 200,
          }),
      ),
    );

    await expect(fetchPSKReporterSpots()).resolves.toEqual([]);
  });
});
