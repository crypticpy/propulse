import { describe, expect, it } from "vitest";
import { compactSSTPayload } from "./sst";

describe("SST payload compaction", () => {
  it("drops land cells and normalizes longitudes", () => {
    expect(
      compactSSTPayload({
        table: {
          columnNames: ["time", "zlev", "latitude", "longitude", "sst"],
          rows: [
            ["2026-07-18T12:00:00Z", 0, -10, 350, 22.5],
            ["2026-07-18T12:00:00Z", 0, 20, 10, null],
            ["2026-07-18T12:00:00Z", 0, 30, 120, 28.25],
            ["2026-07-18T12:00:00Z", 0, null, 0, 15],
            ["2026-07-18T12:00:00Z", 0, 0, "", 15],
          ],
        },
      }),
    ).toEqual({
      timestamp: "2026-07-18T12:00:00Z",
      rows: [
        { lat: -10, lon: -10, sst: 22.5 },
        { lat: 30, lon: 120, sst: 28.25 },
      ],
    });
  });
});
