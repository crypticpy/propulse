import { MapFlyout } from "propulse";

export function GridActions() {
  return (
    <MapFlyout
      visible
      position={{ x: 60, y: 60 }}
      lat={35.68}
      lon={139.65}
      grid="PM95"
      onAction={() => {}}
      onClose={() => {}}
    />
  );
}

export function SouthernHemisphereGrid() {
  return (
    <MapFlyout
      visible
      position={{ x: 60, y: 60 }}
      lat={-31.95}
      lon={115.86}
      grid="OF78"
      onAction={() => {}}
      onClose={() => {}}
    />
  );
}
