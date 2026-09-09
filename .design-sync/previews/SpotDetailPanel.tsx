import { SpotDetailPanel, Surface } from "propulse";

// spot is `any` at the component boundary but must match the real DXSpot
// shape from src/types/dxcluster.ts.
export function FullDetail() {
  const spot = {
    id: "spot-1",
    spotter: "W1AW",
    spotterGrid: "FN31",
    dx: "JA1XYZ",
    dxGrid: "PM95",
    frequency: 14074.0,
    mode: "FT8",
    comment: "loud sig, 599",
    time: new Date(),
    band: "20m",
    dxLat: 35.7,
    dxLon: 139.7,
    spotterLat: 41.7,
    spotterLon: -72.7,
  };
  return (
    <Surface>
      <div style={{ width: 520 }}>
        <SpotDetailPanel spot={spot} />
      </div>
    </Surface>
  );
}

export function MinimalDetail() {
  const spot = {
    id: "spot-2",
    spotter: "DL2ABC",
    dx: "VK6LC",
    frequency: 21030.0,
    mode: "CW",
    comment: "",
    time: new Date(),
    band: "15m",
  };
  return (
    <Surface>
      <div style={{ width: 520 }}>
        <SpotDetailPanel spot={spot} />
      </div>
    </Surface>
  );
}
