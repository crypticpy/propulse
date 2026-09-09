import type { CSSProperties } from "react";
import { HamClockRail } from "propulse";

/**
 * HamClockRail composes real registered tiles from the shipped page
 * catalogue (`WALL_PAGES` in `src/lib/hamclock/wallPages.ts`) via the store's
 * default `railLayout`. Each story below picks a real shipped page index so
 * the cell renders actual tile components (several of them from this same
 * batch), not fabricated content. `.hc-rail` is `position: absolute` inside
 * its nearest positioned ancestor, so each story wraps it in a sized,
 * `position: relative` container standing in for the wall stage.
 *
 * `--hc-rail` normally derives from the viewport width (`18vw`), which on
 * the capture harness's narrow single-story viewport shrinks the rail
 * enough to wrap every tile title onto two lines. Setting it directly on
 * the wrapper is the same technique the real wall relies on for density
 * (`--hc-scale`) — a token override, not a hack — and reproduces the width
 * an actual 1080p/4K wall gives the rail.
 */
const RAIL_VARS = { "--hc-rail": "300px" } as CSSProperties;

export function SolarPageLeftRail() {
  return (
    <div
      style={{
        position: "relative",
        width: 340,
        height: 680,
        background: "var(--hc-bg)",
        ...RAIL_VARS,
      }}
    >
      {/* WALL_PAGES[1] = "solar": left = [xray, solarWind, spaceWx, sun] */}
      <HamClockRail side="left" pageIndex={1} label="Left rail — Solar & Space Wx" />
    </div>
  );
}

export function SdrPageLeftRail() {
  return (
    <div
      style={{
        position: "relative",
        width: 340,
        height: 680,
        background: "var(--hc-bg)",
        ...RAIL_VARS,
      }}
    >
      {/* WALL_PAGES[4] = "sdr": left = [sdrScope, sdrDecodes, wsjtx] */}
      <HamClockRail side="left" pageIndex={4} label="Left rail — SDR" />
    </div>
  );
}

export function SpotsPageLeftRail() {
  return (
    <div
      style={{
        position: "relative",
        width: 340,
        height: 680,
        background: "var(--hc-bg)",
        ...RAIL_VARS,
      }}
    >
      {/* WALL_PAGES[0] = "spots" right rail is 5 tiles (bestBand, greyLine,
          pskStation, reliability, activations) — too tall for one card at
          real size, so this story shows the left rail's 4 instead
          (cluster, bandActivity, recentContacts, dxTarget), one of which
          (recentContacts) is this batch's own tile. */}
      <HamClockRail side="left" pageIndex={0} label="Left rail — Spots & Activity" />
    </div>
  );
}
