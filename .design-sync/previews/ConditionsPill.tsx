import { ConditionsPill, Surface } from "propulse";

// ConditionsPill has no data props -- it reads useKIndex/useSolarFlux itself.
// This sandbox has no solar data loaded, so both stories show the honest
// loading/empty state the mobile header actually renders on first paint.
export function MobileHeader() {
  return (
    <Surface>
      <ConditionsPill compact />
    </Surface>
  );
}

export function Expanded() {
  return (
    <Surface>
      <ConditionsPill />
    </Surface>
  );
}
