/**
 * Shared operating-state strip: session · band · target, read live from the
 * workflow cursor (`operatingStateStore`, #658) that every screen of this
 * operator writes.
 *
 * It also carries the "Follow my other screens" kill switch. The settings
 * dialog's Display tab has the same switch (#700); this copy stays because a
 * sharing switch the operator cannot find is worse than one shown twice.
 */

import { FollowScreensToggle } from "@/components/workspace/FollowScreensToggle";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

const EMPTY = "—";

function StateItem({ label, value }: { label: string; value: string }) {
  return (
    // The label is muted, the value is not: the value is the thing an
    // operator reads across the desk (legibility standard, DS-16).
    <span>
      <span className="su-hint">{label}</span> <span className="su-mono">{value}</span>
    </span>
  );
}

export function StateStrip() {
  const sessionId = useOperatingStateStore((state) => state.cursor.sessionId);
  const band = useOperatingStateStore((state) => state.cursor.band);
  const target = useOperatingStateStore((state) => state.cursor.target);

  return (
    <div className="su-surface su-inline workspace-state-strip" aria-label="Shared operating state">
      <StateItem label="SESSION" value={sessionId ?? EMPTY} />
      <StateItem label="BAND" value={band ? band.toUpperCase() : EMPTY} />
      <StateItem label="TARGET" value={target?.callsign ?? EMPTY} />
      <div className="ml-auto w-80 max-w-full">
        <FollowScreensToggle />
      </div>
    </div>
  );
}
