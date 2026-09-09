import { HamClockSpotsSidebar } from "propulse";

/**
 * Zero-required-prop DX/activation spots sidebar wrapping DXSpotList plus
 * POTA/SOTA/WWFF tabs. Reads spot data from React Query hooks
 * (`useDXCluster`, `useActivationSpots`) against the sandbox's empty spot
 * cache, so this renders the sidebar's own honest empty/loading tab state.
 */
export function Default() {
  return (
    <div style={{ width: 340, height: 480, background: "var(--hc-bg)" }}>
      <HamClockSpotsSidebar />
    </div>
  );
}
