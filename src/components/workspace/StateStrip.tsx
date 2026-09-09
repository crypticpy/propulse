/**
 * Shared operating-state strip: session · band · target, read live from the
 * workflow cursor (`operatingStateStore`, #658) that every screen of this
 * operator writes.
 *
 * It also carries the "Follow my other screens" kill switch for now — the
 * workspace SETTINGS dialog that will own it is another task's file (#657),
 * and a sharing switch the operator cannot find is worse than one in an
 * unusual place.
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
