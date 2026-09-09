import { describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { clusterSpots } from "./compatibility";

// Stand in for `stableReportId` with a constant "hash" so two distinct
// observation keys collide the way a real FNV-1a collision would, without
// needing to find one. Re-implements the real suffix-disambiguation contract
// (candidate is reused only for `used.get(candidate) === key`) so this
// isolates whether `used` is threaded across the batch (Path 1 from #736)
// from the raw-id override (Path 2), which is exercised separately below.
// `hashStableString` itself can't be mocked this way: `stableReportId` calls
// it via a same-module binding, which `vi.mock` cannot intercept.
vi.mock("@/lib/spots/presentation/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/spots/presentation/identity")>();
  return {
    ...actual,
    stableReportId: (key: string, used: Map<string, string>) => {
      let candidate = "rfixed";
      let n = 2;
      while (used.has(candidate) && used.get(candidate) !== key) {
        candidate = `rfixed-${n}`;
        n += 1;
      }
      used.set(candidate, key);
      return candidate;
    },
  };
});

function liveSpot(id: string, overrides: Partial<LiveSpot> = {}): LiveSpot {
  return {
    id,
    spotter: "K1ABC",
    dx: "ZZ0ZZZ",
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    source: "PSKReporter",
    ...overrides,
  };
}

describe("clusterSpots report-id collisions (#736)", () => {
  it("keeps both spots when stableReportId's shared `used` map must disambiguate a hash collision", () => {
    // Neither id parses as a contract id, so only the generated
    // `stableReportId` path is exercised (Path 1).
    const spots = [
      liveSpot("not a contract id!", {
        dx: "EA1AAA",
        dxLat: 40.4,
        dxLon: -3.7,
        time: new Date("2026-08-31T10:00:00Z"),
      }),
      liveSpot("also not valid!", {
        dx: "LA1BBB",
        dxLat: 60,
        dxLon: 8,
        time: new Date("2026-08-31T11:00:00Z"),
      }),
    ];

    const result = clusterSpots(spots, { enabled: false, minClusterSize: 2 });

    const survivorIds = [
      ...result.clusters.flatMap((cluster) => cluster.spots),
      ...result.singles,
    ]
      .map((spot) => spot.id)
      .sort();
    expect(survivorIds).toEqual(["also not valid!", "not a contract id!"]);
    expect(result.totalSpots).toBe(2);
  });

  it("keeps both spots when two upstream spots share a raw id that both parse as a contract id", () => {
    // Both spots use the same raw `id`, which is a valid contract id, so the
    // raw-id override (Path 2) fires for both unless it checks the batch.
    const spots = [
      liveSpot("dup-report-id", {
        dx: "EA1AAA",
        dxLat: 40.4,
        dxLon: -3.7,
        time: new Date("2026-08-31T10:00:00Z"),
      }),
      liveSpot("dup-report-id", {
        dx: "LA1BBB",
        dxLat: 60,
        dxLon: 8,
        time: new Date("2026-08-31T11:00:00Z"),
      }),
    ];

    const result = clusterSpots(spots, { enabled: false, minClusterSize: 2 });

    const survivorSpots = [
      ...result.clusters.flatMap((cluster) => cluster.spots),
      ...result.singles,
    ];
    expect(survivorSpots).toHaveLength(2);
    expect(survivorSpots.map((spot) => spot.dx).sort()).toEqual(["EA1AAA", "LA1BBB"]);
    expect(result.totalSpots).toBe(2);
  });
});
