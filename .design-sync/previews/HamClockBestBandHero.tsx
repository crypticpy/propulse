import { HamClockBestBandHero } from "propulse";

/**
 * Zero-prop wall headline; reads Band Health evidence via `useBandVerdicts`.
 * The capture sandbox has no station QTH, so band evidence never becomes
 * "ready" — this is the honest waiting state the header shows on a fresh
 * install before a QTH is set (source: `best ? ... : "Waiting for live
 * evidence…"`), which is the only state its zero props can honestly show.
 */
export function WaitingForEvidence() {
  return (
    <div style={{ width: 340, background: "var(--hc-bg)" }}>
      <HamClockBestBandHero />
    </div>
  );
}
