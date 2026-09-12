import { SatelliteFilters, Surface } from "propulse";

/**
 * SatelliteFilters is store/hook-driven — category filter, tracked NORAD
 * IDs, and the loaded-satellite count come from real stores and a TLE fetch
 * (useSatellites). Inside the design-sync sandbox the TLE fetch has nothing
 * to resolve against, so this renders the honest empty/default state:
 * chips collapse to "All 0" and the two action buttons still show.
 */
export function Default() {
  return (
    <Surface style={{ width: 260 }}>
      <SatelliteFilters onSeeFullList={() => {}} />
    </Surface>
  );
}
