import { HamClockContestsPanel } from "propulse";

/**
 * Zero-prop WA7BNM contest-calendar panel; fetches the live RSS feed via
 * `useRssFeed`. The capture sandbox has no network access to that feed, so
 * this renders the panel's own "Contest calendar unavailable" state — a real
 * state the component draws itself when the feed errors, not a fabrication.
 */
export function Unavailable() {
  return (
    <div style={{ width: 320, background: "var(--hc-bg)", padding: 8 }}>
      <HamClockContestsPanel />
    </div>
  );
}
