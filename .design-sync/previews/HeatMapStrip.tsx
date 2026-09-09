import { useEffect } from "react";
import { HeatMapStrip, StationProvider } from "propulse";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";

// `title` is accepted but unused (shape-compatibility with `WallTileProps`).
// The headline cell comes from `useDXStore.spots` + `useActiveWorkspace().
// display` (headline rule, visible bands, heat-map preset) — the display
// settings already default to every band + `headlineRule: "ladder"`
// (`workspaceStore.ts`), so only the non-persisted spot feed needs seeding.
// `evaluateLadder` (`@/lib/verdict/ladder.ts`) reaches VERIFIED/HOT from
// real observation counts alone (>=6 deduplicated (dx, reporter) pairs from
// >=3 reporters in the trailing 20 min, "hot" once the 10-min trend is
// rising) — no physics score needed, so `useBandVerdicts` is left
// unseeded, same as every other physics-driven card in this set
// (`BandVerdictPanel`'s "Wall"/"Narrow" wave-learnings note).
function spot(overrides: Partial<DXSpot> & { id: string }): DXSpot {
  return {
    spotter: "W1AW",
    dx: "JA1AAA",
    frequency: 14025,
    mode: "CW",
    comment: "",
    time: new Date(),
    band: "20m",
    ...overrides,
  };
}

function seedSpots(): DXSpot[] {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  return [
    // 20m -> AS: 3 reporters x 2 distinct JA calls, all in the last 6 min
    // -> obs20m=6, reporters20m=3 -> VERIFIED, recent-heavy -> rising -> HOT.
    spot({ id: "h1", spotter: "W1AW", dx: "JA1AAA", band: "20m", time: minutesAgo(1) }),
    spot({ id: "h2", spotter: "W1AW", dx: "JA2BBB", band: "20m", time: minutesAgo(2) }),
    spot({ id: "h3", spotter: "K5XYZ", dx: "JA1AAA", band: "20m", time: minutesAgo(3) }),
    spot({ id: "h4", spotter: "K5XYZ", dx: "JA2BBB", band: "20m", time: minutesAgo(4) }),
    spot({ id: "h5", spotter: "DL2ABC", dx: "JA1AAA", band: "20m", time: minutesAgo(5) }),
    spot({ id: "h6", spotter: "DL2ABC", dx: "JA2BBB", band: "20m", time: minutesAgo(6) }),
    // 15m -> EU: two observations, below the VERIFIED bar -> STIRRING.
    spot({ id: "s1", spotter: "W1AW", dx: "DL1XYZ", band: "15m", mode: "SSB", time: minutesAgo(12) }),
    spot({ id: "s2", spotter: "K5ABC", dx: "DL1XYZ", band: "15m", mode: "SSB", time: minutesAgo(14) }),
  ];
}

export function Populated() {
  useEffect(() => {
    useDXStore.setState({
      spots: seedSpots(),
      clusterFeed: { state: "CURRENT", windowMinutes: 20, fetchedAt: Date.now(), observedAt: Date.now() },
    });
  }, []);

  return (
    <StationProvider style={{ width: 420 }}>
      <HeatMapStrip />
    </StationProvider>
  );
}
