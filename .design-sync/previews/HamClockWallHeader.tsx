import type { CSSProperties } from "react";
import { HamClockWallHeader } from "propulse";

/**
 * HamClockWallHeader's only prop is `onOpenSettings`; the callsign, grid and
 * dual clocks all come from `userStore` / `useActiveLocation`. With no
 * station configured in the preview harness it renders the header's real
 * "NO CALL — Station not configured" state, which is a designed fallback
 * (wall spec) rather than a blank bar.
 *
 * The capture harness's single-story viewport is 900px wide; a real wall
 * header spans a 1080p/4K display, so these widths are sized to the
 * harness rather than the shipped width — wider would just clip.
 */
export function Default() {
  return (
    <div style={{ width: 860, background: "var(--hc-bg)" }}>
      <HamClockWallHeader onOpenSettings={() => {}} />
    </div>
  );
}

/**
 * The real desk density (wall spec §3, §15) multiplies every `--hc-*` token
 * by `--hc-scale` (0.72 on desk vs 1 on wall) — a token override, the same
 * mechanism the shipped `.hc-wall[data-density="desk"]` class uses, not a
 * layout hack. It gives a legitimate second, narrower composition.
 */
export function DeskScale() {
  return (
    <div
      style={{ width: 680, background: "var(--hc-bg)", "--hc-scale": "0.72" } as CSSProperties}
    >
      <HamClockWallHeader onOpenSettings={() => {}} />
    </div>
  );
}
