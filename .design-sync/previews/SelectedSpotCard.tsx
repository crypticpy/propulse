import { SelectedSpotCard } from "propulse";

function baseSpot(overrides: Record<string, unknown> = {}) {
  return {
    id: "spot-1",
    spotter: "W1AW",
    spotterGrid: "FN31",
    dx: "JA1XYZ",
    dxGrid: "PM95",
    frequency: 14074,
    mode: "FT8",
    comment: "TNX 73 GL",
    time: new Date(Date.now() - 4 * 60 * 1000),
    band: "20m",
    dxLat: 35.68,
    dxLon: 139.65,
    ...overrides,
  };
}

export function StrongSignal() {
  return (
    <SelectedSpotCard
      spot={baseSpot()}
      position={{ x: 260, y: 260 }}
      difficulty={2}
      optimalSignal={{
        band: "20m",
        status: "excellent",
        sUnit: { value: 7, text: "S7", dBm: -87 },
        snrEstimate: 12,
        confidence: 82,
      }}
      onOperator={() => {}}
      onViewPath={() => {}}
      onClose={() => {}}
    />
  );
}

export function NoViableBand() {
  return (
    <SelectedSpotCard
      spot={baseSpot({
        id: "spot-2",
        dx: "VK6LC",
        dxGrid: "OF87",
        dxLat: -31.95,
        dxLon: 115.86,
        mode: "CW",
        frequency: 21030,
        band: "15m",
        comment: "",
      })}
      position={{ x: 260, y: 260 }}
      difficulty={4}
      signalUnavailableReason="No viable modeled HF band right now"
      onOperator={() => {}}
      onClose={() => {}}
    />
  );
}
