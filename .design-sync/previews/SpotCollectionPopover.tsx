import { SpotCollectionPopover } from "propulse";

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
    source: "PSKReporter",
    snr: -8,
    ...overrides,
  };
}

export function GridWatchGroup() {
  return (
    <SpotCollectionPopover
      visible
      position={{ x: 60, y: 60 }}
      title="6 active spots"
      subtitle="JO31 · 51.5°N, 7.0°E"
      spots={[
        spot({ id: "spot-1", dx: "DL2ABC", spotter: "W1AW", frequency: 14074, mode: "FT8", source: "PSKReporter", snr: -8 }),
        spot({ id: "spot-2", dx: "DL2ABC", spotter: "K4XYZ", frequency: 21030, mode: "CW", band: "15m", source: "RBN", wpm: 24, snr: undefined }),
        spot({ id: "spot-3", dx: "DL2ABC", spotter: "VK6LC", frequency: 7074, mode: "FT8", band: "40m", source: "PSKReporter", snr: -14 }),
        spot({ id: "spot-4", dx: "DL2ABC", spotter: "JA3ABC", frequency: 14195, mode: "SSB", band: "20m", source: "Cluster", snr: undefined }),
        spot({ id: "spot-5", dx: "DL2ABC", spotter: "N2XYZ", frequency: 18100, mode: "FT8", band: "17m", source: "WSJT-X", snr: 2 }),
        spot({ id: "spot-6", dx: "DL2ABC", spotter: "G4ABC", frequency: 28074, mode: "FT8", band: "10m", source: "PSKReporter", snr: -20 }),
      ]}
      onClose={() => {}}
      onSpotSelect={() => {}}
    />
  );
}

export function SingleSpotAtPin() {
  return (
    <SpotCollectionPopover
      visible
      position={{ x: 60, y: 60 }}
      title="1 active spot"
      subtitle="EM12 · 35.7°N, 78.6°W"
      spots={[
        spot({ id: "spot-solo", dx: "W4DX", dxGrid: "EM95", spotter: "W1AW", frequency: 3573, mode: "FT8", band: "80m", source: "PSKReporter", snr: -18, comment: "POTA activation" }),
      ]}
      onClose={() => {}}
      onSpotSelect={() => {}}
    />
  );
}
