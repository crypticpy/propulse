/**
 * Shared operating-state strip at phone density (#659, refs #658).
 *
 * Same fields as the workstation's `StateStrip` (session, band, target),
 * read from the same `operatingStateStore` cursor, stacked for a 390 pt
 * canvas instead of one inline row. The "Follow my other screens" switch
 * lives in `PhoneSetupMenu` instead of here, so this persistent strip stays
 * three read lines at every page (no in-widget scrolling,
 * `hamclock-wall-spec.md` §2).
 */

import { useOperatingStateStore } from "@/stores/operatingStateStore";

const EMPTY = "—";

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="phone-state-row">
      <span className="su-hint">{label}</span>
      <span className="su-mono">{value}</span>
    </div>
  );
}

export function PhoneStateStrip() {
  const sessionId = useOperatingStateStore((state) => state.cursor.sessionId);
  const band = useOperatingStateStore((state) => state.cursor.band);
  const target = useOperatingStateStore((state) => state.cursor.target);

  return (
    <div className="su-surface phone-state-strip" aria-label="Shared operating state">
      <StateRow label="SESSION" value={sessionId ?? EMPTY} />
      <StateRow label="BAND" value={band ? band.toUpperCase() : EMPTY} />
      <StateRow label="TARGET" value={target?.callsign ?? EMPTY} />
    </div>
  );
}
