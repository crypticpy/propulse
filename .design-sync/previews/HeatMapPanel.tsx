import { useEffect } from "react";
import { HeatMapPanel, StationProvider } from "propulse";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";

// `title` is accepted but unused (shape-compatibility with `WallTileProps`).
// Same seeding rationale as `HeatMapStrip.tsx`: the full band x continent
// grid comes from `useDXStore.spots` + `useActiveWorkspace().display`,
// whose defaults (`visibleBands`: every band, `headlineRule: "ladder"`) are
// already populated, so only the non-persisted spot feed needs seeding.
// Real observation counts alone reach VERIFIED/HOT and STIRRING via
// `evaluateLadder` — no physics score needed, so `useBandVerdicts` (which
// needs live SFI/Kp) is left unseeded, same honest-state convention as
// `BandVerdictPanel`.
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
    // 20m -> AS: VERIFIED + rising -> HOT (see HeatMapStrip.tsx).
    spot({ id: "h1", spotter: "W1AW", dx: "JA1AAA", band: "20m", time: minutesAgo(1) }),
    spot({ id: "h2", spotter: "W1AW", dx: "JA2BBB", band: "20m", time: minutesAgo(2) }),
    spot({ id: "h3", spotter: "K5XYZ", dx: "JA1AAA", band: "20m", time: minutesAgo(3) }),
    spot({ id: "h4", spotter: "K5XYZ", dx: "JA2BBB", band: "20m", time: minutesAgo(4) }),
    spot({ id: "h5", spotter: "DL2ABC", dx: "JA1AAA", band: "20m", time: minutesAgo(5) }),
    spot({ id: "h6", spotter: "DL2ABC", dx: "JA2BBB", band: "20m", time: minutesAgo(6) }),
    // 15m -> EU: STIRRING (below the VERIFIED bar).
    spot({ id: "s1", spotter: "W1AW", dx: "DL1XYZ", band: "15m", mode: "SSB", time: minutesAgo(12) }),
    spot({ id: "s2", spotter: "K5ABC", dx: "DL1XYZ", band: "15m", mode: "SSB", time: minutesAgo(14) }),
    // 10m -> NA: single observation on a third band/continent pair, for a
    // grid that reads as genuinely mixed rather than one hot cell alone.
    spot({ id: "n1", spotter: "G4ABC", dx: "W1AW", band: "10m", mode: "SSB", time: minutesAgo(3) }),
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
    <StationProvider style={{ width: 640 }}>
      <HeatMapPanel />
    </StationProvider>
  );
}
