import { PinFlyout } from "propulse";

const now = Date.now();

function dxSpot(overrides: Record<string, unknown> = {}) {
  return {
    id: "spot-1",
    spotter: "W1AW",
    spotterGrid: "FN31",
    dx: "JA1XYZ",
    dxGrid: "PM95",
    frequency: 14074,
    mode: "FT8",
    comment: "TNX 73",
    time: new Date(now - 4 * 60 * 1000),
    band: "20m",
    dxLat: 35.68,
    dxLon: 139.65,
    ...overrides,
  };
}

export function DxpeditionPin() {
  return (
    <PinFlyout
      visible
      position={{ x: 320, y: 300 }}
      pin={{
        id: "pin-1",
        lat: 35.68,
        lon: 139.65,
        grid: "PM95",
        name: "Tokyo DXpedition",
        category: "dxpedition",
        notes: "POTA JA-1234, 20 m FT8, heavy pileup expected on the weekend.",
        expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }}
      spots={[
        dxSpot({ id: "spot-1", dx: "JA1XYZ", frequency: 14074, mode: "FT8" }),
        dxSpot({
          id: "spot-2",
          dx: "JA1XYZ",
          spotter: "VK6LC",
          frequency: 21030,
          mode: "CW",
          band: "15m",
          time: new Date(now - 22 * 60 * 1000),
        }),
      ]}
      onSetTarget={() => {}}
      onSpotSelect={() => {}}
      onEditPin={() => {}}
      onDeletePin={() => {}}
      onClose={() => {}}
    />
  );
}

export function FriendTargeted() {
  return (
    <PinFlyout
      visible
      position={{ x: 320, y: 300 }}
      pin={{
        id: "pin-2",
        lat: 51.5,
        lon: 7.0,
        grid: "JO31",
        name: "DL2ABC Home Station",
        category: "friend",
        notes: "",
        createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }}
      currentTargetGrid="JO31"
      spots={[]}
      onSetTarget={() => {}}
      onSpotSelect={() => {}}
      onEditPin={() => {}}
      onClose={() => {}}
    />
  );
}
