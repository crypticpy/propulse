import { MapStatusChip, Surface } from "propulse";

// MapStatusChip takes only className -- it composes ConflictBadge,
// ConnectivityBadge, SyncStatusIndicator and HealthStatusIndicator itself
// from their own hooks/stores. This is the honest default cluster state
// on first paint of the PropSphere toolbar.
export function Toolbar() {
  return (
    <Surface>
      <MapStatusChip />
    </Surface>
  );
}

export function InRibbon() {
  return (
    <Surface className="bg-void-black/60">
      <MapStatusChip className="flex shrink-0" />
    </Surface>
  );
}
