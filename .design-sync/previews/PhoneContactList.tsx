import { useEffect } from "react";
import { PhoneContactList, StationProvider } from "propulse";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";

// No props — rows are `useDXStore.spots` filtered to the shared cursor's
// `band`, newest first. Neither field is persisted, so seeding them here
// cannot leak into a later capture. One row is marked "selected" by giving
// it the same spot id as `cursor.target.spotId`.
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
    spot({ id: "c1", spotter: "W1AW", dx: "PY2ABC", frequency: 14195, mode: "USB", band: "20m", time: minutesAgo(1) }),
    spot({ id: "c2", spotter: "K5XYZ", dx: "JA1AAA", frequency: 14025, mode: "CW", band: "20m", time: minutesAgo(4) }),
    spot({ id: "c3", spotter: "DL2ABC", dx: "VK6LC", frequency: 14074, mode: "FT8", band: "20m", time: minutesAgo(9) }),
    // Different band — must be filtered out of the "20m" list.
    spot({ id: "c4", spotter: "F5ABC", dx: "3B8XF", frequency: 21030, mode: "SSB", band: "15m", time: minutesAgo(2) }),
  ];
}

export function Populated() {
  useEffect(() => {
    const store = useOperatingStateStore.getState();
    store.reset();
    useDXStore.setState({ spots: seedSpots() });
    store.setBand("20m");
    store.setTarget({ callsign: "PY2ABC", grid: "GG66", lat: null, lon: null, spotId: "c1" });
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <PhoneContactList />
    </StationProvider>
  );
}
