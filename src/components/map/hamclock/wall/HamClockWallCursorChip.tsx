/**
 * Cursor chip (#712): what the shared operating cursor currently points at,
 * and which other screen wrote it. The wall's only view into
 * `operatingStateStore`'s workflow cursor — read-only, like the rest of the
 * wall: nothing here writes the cursor back.
 *
 * Renders nothing visible when the cursor has never been shared (no other
 * screen has ever set a target here), so a wall running alone gains no
 * header height at all — the region itself stays mounted (empty, via
 * `LiveRegion`) so a later cursor update announces. Reuses `.hc-call
 * small`'s existing dim styling by staying a plain `<small>`, plus the
 * theme's own `.hc-info-text.hc-glow` for the value — the same pair
 * `WallClocks` already uses for the UTC time — so no new CSS is needed for
 * this to read at a distance (legibility standard).
 */

import { LiveRegion } from "@/components/ui/LiveRegion";
import { selectLiveRegistrations, useOperatingStateStore } from "@/stores/operatingStateStore";

/** The canvas type of whichever live screen last wrote the target, if any. */
function useCursorSourceLabel(): string | null {
  return useOperatingStateStore((state) => {
    const by = state.stamps.target.by;
    if (!by || by === state.deviceId) return null;
    const source = selectLiveRegistrations(state).find((registration) => registration.deviceId === by);
    return source?.canvasType ?? null;
  });
}

export function HamClockWallCursorChip() {
  const target = useOperatingStateStore((state) => state.cursor.target);
  const band = useOperatingStateStore((state) => state.cursor.band);
  const source = useCursorSourceLabel();

  const hasCursor = Boolean(target || band);

  return (
    <LiveRegion as="small" role="status" aria-label="Shared operating cursor">
      {hasCursor ? (
        <>
          TARGET <span className="hc-info-text hc-glow">{target?.callsign?.toUpperCase() ?? "—"}</span>
          {band ? ` · ${band.toUpperCase()}` : ""}
          {source ? ` · FROM ${source.toUpperCase()}` : ""}
        </>
      ) : null}
    </LiveRegion>
  );
}
