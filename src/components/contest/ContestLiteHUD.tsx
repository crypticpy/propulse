/**
 * ContestLiteHUD
 *
 * Minimal contest access in PropSphere LiteMode:
 * - Floating HUD pill (always visible during an active session)
 * - Expandable bottom sheet containing the entry + voice controls
 */

import { useCallback, useMemo, useState } from "react";
import { ContestLiteHudPill } from "@/components/contest/ContestLiteHudPill";
import { ContestLiteHudSheet } from "@/components/contest/ContestLiteHudSheet";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { getContestById } from "@/lib/data/contests";
import { useQsoBadge } from "@/hooks/useQsoBadge";

export function ContestLiteHUD() {
  const activeSession = useContestStore((s) => s.activeSession);
  const isDupeCheck = useContestStore((s) => s.isDupe);

  const sessionId = activeSession?.id ?? null;
  const dismissed = useContestUIStore((s) =>
    sessionId ? s.liteHudDismissedBySessionId[sessionId] ?? false : true,
  );
  const dismissLiteHud = useContestUIStore((s) => s.dismissLiteHud);
  const requestEntryFocus = useContestUIEphemeralStore(
    (s) => s.requestEntryFocus,
  );

  const currentBand = useContestUIStore((s) =>
    sessionId ? s.bandBySessionId[sessionId] ?? "20m" : "20m",
  );
  const currentMode = useContestUIStore((s) =>
    sessionId ? s.modeBySessionId[sessionId] ?? "CW" : "CW",
  );
  const draft = useContestUIStore((s) =>
    sessionId ? s.draftBySessionId[sessionId] ?? "" : "",
  );

  const [expanded, setExpanded] = useState(false);

  const contestName = useMemo(() => {
    if (!activeSession) return null;
    return getContestById(activeSession.contestId)?.name ?? activeSession.contestId;
  }, [activeSession]);

  const lastQso = activeSession?.qsos.length
    ? activeSession.qsos[activeSession.qsos.length - 1]
    : null;

  const badge = useQsoBadge({
    activeSession,
    draft,
    band: currentBand,
    mode: currentMode,
    isDupeCheck,
  });

  const handleOpen = useCallback(() => {
    setExpanded(true);
    requestEntryFocus();
  }, [requestEntryFocus]);

  if (!activeSession || !sessionId || dismissed) {
    return null;
  }

  return (
    <>
      {!expanded && (
        <ContestLiteHudPill
          sessionId={sessionId}
          runMode={activeSession.runMode}
          lastQsoTimestamp={lastQso?.timestamp ?? null}
          badge={badge}
          onOpen={handleOpen}
          onDismiss={() => dismissLiteHud(sessionId)}
        />
      )}

      {expanded && (
        <ContestLiteHudSheet
          sessionId={sessionId}
          contestName={contestName}
          band={currentBand}
          mode={currentMode}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

export default ContestLiteHUD;
