import { FireFlyout } from "propulse";

export function HighConfidenceHotspot() {
  return (
    <FireFlyout
      visible
      position={{ x: 60, y: 60 }}
      hotspot={{
        lat: 34.05,
        lon: -118.24,
        brightness: 341,
        confidence: "high",
        frp: 62.4,
      }}
      onClose={() => {}}
    />
  );
}

export function NominalConfidenceHotspot() {
  return (
    <FireFlyout
      visible
      position={{ x: 60, y: 60 }}
      hotspot={{
        lat: -6.2,
        lon: 106.82,
        brightness: 312,
        confidence: "nominal",
        frp: 18.7,
      }}
      onClose={() => {}}
    />
  );
}
