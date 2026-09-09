import { SpotHoverPreview } from "propulse";

// The underlying useSpotPathPresentation hook reads station from
// useUserStore with no prop to seed it, so the signal meter shows the
// honest "set your QTH" reason rather than a modeled S-unit.
export function Hovering() {
  return (
    <div style={{ position: "relative", width: 420, height: 320 }}>
      <SpotHoverPreview
        visible
        position={{ x: 120, y: 120 }}
        spot={{
          id: "spot-1",
          spotter: "W1AW",
          spotterGrid: "FN31",
          dx: "JA1XYZ",
          dxGrid: "PM95",
          frequency: 14074,
          mode: "FT8",
          comment: "",
          time: new Date(Date.now() - 3 * 60 * 1000),
          band: "20m",
          dxLat: 35.68,
          dxLon: 139.65,
        }}
        displayTime={new Date()}
        onActivate={() => {}}
      />
    </div>
  );
}

export function CwSpot() {
  return (
    <div style={{ position: "relative", width: 420, height: 320 }}>
      <SpotHoverPreview
        visible
        position={{ x: 120, y: 120 }}
        spot={{
          id: "spot-2",
          spotter: "DL2ABC",
          spotterGrid: "JO31",
          dx: "VK6LC",
          dxGrid: "OF87",
          frequency: 21030,
          mode: "CW",
          comment: "UP 2",
          time: new Date(Date.now() - 8 * 60 * 1000),
          band: "15m",
          dxLat: -31.95,
          dxLon: 115.86,
        }}
        displayTime={new Date()}
        onActivate={() => {}}
      />
    </div>
  );
}
