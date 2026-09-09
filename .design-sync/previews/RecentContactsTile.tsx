import { RecentContactsTile } from "propulse";

/**
 * RecentContactsTile has no props — it reads the active operating location
 * from `userStore` and the logbook via a query. With no station configured
 * in this harness it renders the tile's designed "SET HOME IN SETTINGS"
 * placeholder rather than an ambiguous blank card.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <RecentContactsTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <RecentContactsTile />
    </div>
  );
}
