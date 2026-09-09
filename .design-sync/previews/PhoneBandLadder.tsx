import { useEffect } from "react";
import { PhoneBandLadder, StationProvider } from "propulse";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";

// No props — rows come from `useDXStore.spots` aggregated by
// `computeHeatmap`/`evaluateLadder` (band x continent -> Band Health ladder
// state), filtered to `useWorkspaceStore.phoneVisibleBands` (defaults to
// every band, not persisted here, so it is left alone). Real observation
// counts drive the ladder purely from spot data — no physics score needed —
// per `evaluateLadder`: >=6 deduplicated (dx, reporter) pairs from >=3
// reporters in 20 min enters VERIFIED (HOT once the 10-min trend is
// rising); any single observation is STIRRING; nothing in the window is
// CLOSED. Both `useDXStore.spots` and the operating-state cursor are
// non-persisted fields, safe to seed directly.
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
    // 20m/AS: 3 reporters x 2 distinct JA calls, all within the last 6 min
    // -> obs20m=6, reporters20m=3 -> VERIFIED, recent-heavy -> rising -> HOT.
    spot({ id: "h1", spotter: "W1AW", dx: "JA1AAA", band: "20m", time: minutesAgo(1) }),
    spot({ id: "h2", spotter: "W1AW", dx: "JA2BBB", band: "20m", time: minutesAgo(2) }),
    spot({ id: "h3", spotter: "K5XYZ", dx: "JA1AAA", band: "20m", time: minutesAgo(3) }),
    spot({ id: "h4", spotter: "K5XYZ", dx: "JA2BBB", band: "20m", time: minutesAgo(4) }),
    spot({ id: "h5", spotter: "DL2ABC", dx: "JA1AAA", band: "20m", time: minutesAgo(5) }),
    spot({ id: "h6", spotter: "DL2ABC", dx: "JA2BBB", band: "20m", time: minutesAgo(6) }),
    // 15m/EU: two observations, below the VERIFIED bar -> STIRRING.
    spot({ id: "s1", spotter: "W1AW", dx: "DL1XYZ", band: "15m", mode: "SSB", time: minutesAgo(12) }),
    spot({ id: "s2", spotter: "K5ABC", dx: "DL1XYZ", band: "15m", mode: "SSB", time: minutesAgo(14) }),
  ];
}

export function Populated() {
  useEffect(() => {
    useOperatingStateStore.getState().reset();
    useDXStore.setState({ spots: seedSpots() });
    useOperatingStateStore.getState().setBand("20m");
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <PhoneBandLadder />
    </StationProvider>
  );
}
