import { SpotContextMenu } from "propulse";

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
    time: new Date("2026-09-08T18:37:00Z"),
    band: "20m",
    ...overrides,
  };
}

export function FT8Spot() {
  return (
    <SpotContextMenu
      spot={spot()}
      position={{ x: 60, y: 60 }}
      onClose={() => {}}
      onAction={() => {}}
    />
  );
}

export function CWSpotNoGrid() {
  return (
    <SpotContextMenu
      spot={spot({
        id: "spot-2",
        dx: "VK6LC",
        dxGrid: undefined,
        spotter: "DL2ABC",
        spotterGrid: "JO31",
        frequency: 21030,
        mode: "CW",
        band: "15m",
        comment: "5NN TU",
      })}
      position={{ x: 60, y: 60 }}
      onClose={() => {}}
      onAction={() => {}}
    />
  );
}
