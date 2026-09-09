import { SatelliteFilters, Surface } from "propulse";

/**
 * SatelliteFilters is fully store/hook-driven — category filter, tracked
 * NORAD IDs, and the satellite list itself all come from real stores and a
 * TLE fetch (useSatellites), with no props to seed content. Inside the
 * design-sync sandbox the TLE fetch has nothing to resolve against, so this
 * renders the honest empty/default state: filter chips collapse to "All 0"
 * and the list sections are empty. That is a legitimate outcome for a
 * component with zero props — see learnings.
 */
export function Default() {
  return (
    <Surface style={{ width: 260 }}>
      <SatelliteFilters />
    </Surface>
  );
}
