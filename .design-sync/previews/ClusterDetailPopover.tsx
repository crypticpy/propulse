import { ClusterDetailPopover } from "propulse";

const now = Date.now();

function spot(overrides: Record<string, unknown> = {}) {
  return {
    id: "spot-1",
    spotter: "W1AW",
    spotterGrid: "FN31",
    dx: "JA1XYZ",
    dxGrid: "PM95",
    frequency: 14074,
    mode: "FT8",
    comment: "TNX 73 GL",
    time: new Date(now - 3 * 60 * 1000),
    band: "20m",
    dxLat: 35.68,
    dxLon: 139.65,
    spotterLat: 41.7,
    spotterLon: -72.7,
    source: "PSKReporter",
    ...overrides,
  };
}

export function ActiveCluster() {
  return (
    <ClusterDetailPopover
      visible
      position={{ x: 60, y: 60 }}
      cluster={{
        id: "cluster-1",
        center: { lat: 35.68, lon: 139.65 },
        count: 4,
        primarySpot: spot(),
        spots: [
          spot({ id: "spot-1", dx: "JA1XYZ", frequency: 14074, mode: "FT8" }),
          spot({
            id: "spot-2",
            dx: "JA3ABC",
            spotter: "K4XYZ",
            frequency: 21030,
            mode: "CW",
            band: "15m",
          }),
          spot({
            id: "spot-3",
            dx: "JH1DEF",
            spotter: "VK6LC",
            frequency: 7074,
            mode: "FT8",
            band: "40m",
          }),
          spot({
            id: "spot-4",
            dx: "JR2GHI",
            spotter: "DL2ABC",
            frequency: 14195,
            mode: "SSB",
            band: "20m",
          }),
        ],
      }}
      onClose={() => {}}
      onSpotSelect={() => {}}
    />
  );
}

export function SingleSpotCluster() {
  return (
    <ClusterDetailPopover
      visible
      position={{ x: 60, y: 60 }}
      cluster={{
        id: "cluster-2",
        center: { lat: 51.5, lon: 7.0 },
        count: 1,
        primarySpot: spot({ id: "spot-solo", dx: "DL2ABC", dxGrid: "JO31" }),
        spots: [spot({ id: "spot-solo", dx: "DL2ABC", dxGrid: "JO31" })],
      }}
      onClose={() => {}}
      onSpotSelect={() => {}}
    />
  );
}
