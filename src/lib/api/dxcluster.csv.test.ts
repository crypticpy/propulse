/**
 * The Vite dev proxy returns HamQTH's caret-delimited CSV instead of the Edge
 * Function's JSON, so `fetchClusterFeed` has two parsers. Field 7 of the CSV
 * is the DX continent, which the CSV branch dropped: an unknown-prefix spot
 * then reached `resolveMapSpotSelection` with no continent centroid to fall
 * back to and Set Target announced "cannot be located" for a spot the feed had
 * in fact located (#993 review). Covered here through the public
 * `fetchClusterFeed` because `parseHamQTHCSV` is module-private.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClusterFeed } from "./dxcluster";

function csvResponse(body: string): Response {
  return {
    ok: true,
    headers: { get: () => "text/csv; charset=utf-8" },
    text: async () => body,
  } as unknown as Response;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

// Spotter^Freq^DX^Comment^TimeDate^LoTW^eQSL^Continent^Band^Country^DXCC#
const CSV_LINE =
  "W3LPL^28022.0^EA6EJ^Heard in NH^1606 2026-02-05^L^E^eu^10M^Balearic Islands^21";
const CSV_NO_CONTINENT =
  "W3LPL^28022.0^EA6EJ^Heard in NH^1606 2026-02-05^L^E^^10M^Balearic Islands^21";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dxcluster CSV ingestion (#993 review)", () => {
  it("carries the continent from CSV field 7, normalized to upper case", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => csvResponse(CSV_LINE)),
    );

    const { spots } = await fetchClusterFeed(5);

    expect(spots).toHaveLength(1);
    expect(spots[0].dx).toBe("EA6EJ");
    expect(spots[0].continent).toBe("EU");
  });

  it("leaves continent undefined when the CSV field is blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => csvResponse(CSV_NO_CONTINENT)),
    );

    const { spots } = await fetchClusterFeed(5);

    expect(spots).toHaveLength(1);
    expect(spots[0].continent).toBeUndefined();
  });

  it("normalizes the JSON branch's continent the same way", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          spots: [
            {
              spotter: "W3LPL",
              dx: "EA6EJ",
              frequency: 28022,
              time: "2026-02-05T16:06:00Z",
              band: "10M",
              continent: " eu ",
            },
          ],
        }),
      ),
    );

    const { spots } = await fetchClusterFeed(5);

    expect(spots[0].continent).toBe("EU");
  });
});
