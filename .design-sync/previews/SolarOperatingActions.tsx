import { SolarOperatingActions, Surface } from "propulse";

export function Full() {
  return (
    <Surface>
      <SolarOperatingActions />
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface>
      <SolarOperatingActions compact at="2026-09-08T12:00:00Z" />
    </Surface>
  );
}
