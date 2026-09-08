import { SpotDetailsModal } from "propulse";

export function PSKReporterSpot() {
  return (
    <SpotDetailsModal
      spot={{
        id: "spot-1",
        spotter: "W1AW",
        spotterGrid: "FN31",
        dx: "JA1XYZ",
        dxGrid: "PM95",
        frequency: 14074,
        mode: "FT8",
        comment: "",
        time: new Date(Date.now() - 5 * 60 * 1000),
        band: "20m",
        dxLat: 35.68,
        dxLon: 139.65,
        spotterLat: 41.7,
        spotterLon: -72.7,
        source: "PSKReporter",
        snr: -14,
      }}
      onClose={() => {}}
    />
  );
}

export function ClusterSpot() {
  return (
    <SpotDetailsModal
      spot={{
        id: "spot-2",
        spotter: "DL2ABC",
        spotterGrid: "JO31",
        dx: "VK6LC",
        dxGrid: "OF87",
        frequency: 21030,
        mode: "CW",
        comment: "5NN TU",
        time: new Date(Date.now() - 12 * 60 * 1000),
        band: "15m",
        dxLat: -31.95,
        dxLon: 115.86,
        source: "Cluster",
        wpm: 24,
      }}
      onClose={() => {}}
    />
  );
}
