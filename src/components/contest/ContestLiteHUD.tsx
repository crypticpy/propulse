/**
 * ContestLiteHUD
 *
 * Minimal contest access in PropSphere LiteMode:
 * - Floating HUD pill (always visible during an active session)
 * - Expandable bottom sheet containing the entry + voice controls
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { ContestOneLineEntry } from "@/components/contest";
import { ContestVoiceControls } from "@/components/contest/ContestVoiceControls";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { getContestById } from "@/lib/data/contests";
import {
  parseOneLineEntry,
  extractMultipliers,
  isNewMultiplier,
  type ContestQSODraft,
} from "@/lib/contest";

function formatDeltaSince(timestampIso: string): string {
  const deltaMs = Date.now() - new Date(timestampIso).getTime();
  const deltaSec = Math.max(0, Math.floor(deltaMs / 1000));
  const minutes = Math.floor(deltaSec / 60);
  const seconds = deltaSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildWorkedMultsMap(
  multipliers: Array<{ type: string; value: string; band?: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const mult of multipliers) {
    let typeSet = map.get(mult.type);
    if (!typeSet) {
      typeSet = new Set();
      map.set(mult.type, typeSet);
    }
    const key = mult.band
      ? `${mult.value.toUpperCase()}|${mult.band.toLowerCase()}`
      : mult.value.toUpperCase();
    typeSet.add(key);
  }
  return map;
}

export function ContestLiteHUD() {
  const activeSession = useContestStore((s) => s.activeSession);
  const isDupeCheck = useContestStore((s) => s.isDupe);

  const sessionId = activeSession?.id ?? null;
  const dismissed = useContestUIStore((s) =>
    sessionId ? s.liteHudDismissedBySessionId[sessionId] ?? false : true,
  );
  const dismissLiteHud = useContestUIStore((s) => s.dismissLiteHud);
  const requestEntryFocus = useContestUIStore((s) => s.requestEntryFocus);

  const currentBand = useContestUIStore((s) =>
    sessionId ? s.bandBySessionId[sessionId] ?? "20m" : "20m",
  );
  const currentMode = useContestUIStore((s) =>
    sessionId ? s.modeBySessionId[sessionId] ?? "CW" : "CW",
  );
  const draft = useContestUIStore((s) =>
    sessionId ? s.draftBySessionId[sessionId] ?? "" : "",
  );

  const voice = useContestUIStore(
    (s) => (sessionId ? s.voiceBySessionId[sessionId] ?? null : null),
  );

  const [expanded, setExpanded] = useState(false);

  const contestName = useMemo(() => {
    if (!activeSession) return null;
    return getContestById(activeSession.contestId)?.name ?? activeSession.contestId;
  }, [activeSession]);

  const lastQso = activeSession?.qsos.length
    ? activeSession.qsos[activeSession.qsos.length - 1]
    : null;

  const badge = useMemo(() => {
    if (!activeSession || !draft.trim()) {
      return null;
    }
    const contest = getContestById(activeSession.contestId);
    if (!contest) {
      return null;
    }

    const parsed = parseOneLineEntry({
      input: draft,
      contest,
      defaults: {
        rst: currentMode === "SSB" ? "59" : "599",
        mode: currentMode,
        band: currentBand,
      },
    });

    if (!parsed.callsign || parsed.callsign.length < 2) {
      return null;
    }

    const isDupe = isDupeCheck(parsed.callsign, currentBand, currentMode);
    if (isDupe) {
      return {
        label: "DUPE",
        classes: "bg-alert-red/15 text-alert-red border-alert-red/40",
      };
    }

    const workedMults = buildWorkedMultsMap(activeSession.multipliers);
    const draftQso: ContestQSODraft = {
      callsign: parsed.callsign,
      frequency: 0,
      band: currentBand,
      mode: currentMode,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toISOString().slice(11, 16).replace(":", ""),
      rstSent: currentMode === "SSB" ? "59" : "599",
      rstRcvd: parsed.rstReceived,
      exchangeSent: activeSession.myExchange,
      exchangeRcvd: parsed.exchangeReceived,
      parsedExchange: parsed.parsedFields,
    };

    const extracted = extractMultipliers(draftQso, contest);
    const hasNewMult = extracted.some((m) => isNewMultiplier(m, workedMults));
    if (hasNewMult) {
      return {
        label: "NEW",
        classes: "bg-signal-green/15 text-signal-green border-signal-green/40",
      };
    }

    return null;
  }, [activeSession, currentBand, currentMode, draft, isDupeCheck]);

  const handleOpen = useCallback(() => {
    setExpanded(true);
    requestEntryFocus();
  }, [requestEntryFocus]);

  if (!activeSession || !sessionId || dismissed) {
    return null;
  }

  const voiceStatus = voice?.status ?? "idle";
  const isRecording = voiceStatus === "recording";

  return (
    <>
      {/* Floating HUD pill */}
      {!expanded && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 shadow-lg">
            <button
              type="button"
              onClick={handleOpen}
              className="text-xs font-bold text-white hover:text-plasma-orange transition-colors"
              title="Open contest entry"
            >
              Contest
            </button>

            <span className="text-[10px] text-gray-400 font-mono">
              {activeSession.runMode.toUpperCase()}
            </span>

            {lastQso && (
              <span className="text-[10px] text-gray-400">
                Last{" "}
                <span className="text-white font-mono">
                  {formatDeltaSince(lastQso.timestamp)}
                </span>
              </span>
            )}

            {badge && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.classes}`}
              >
                {badge.label}
              </span>
            )}

            <button
              type="button"
              onClick={() => useContestUIStore.getState().issueVoiceCommand(isRecording ? "stop" : "start", sessionId)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                isRecording
                  ? "bg-alert-red/20 text-alert-red border-alert-red/40 hover:bg-alert-red/30"
                  : "bg-cosmic-cyan/15 text-cosmic-cyan border-cosmic-cyan/40 hover:bg-cosmic-cyan/20"
              }`}
              title="Toggle voice (Ctrl+Shift+.)"
            >
              {isRecording ? "Stop" : "Rec"}
            </button>

            <button
              type="button"
              onClick={() => dismissLiteHud(sessionId)}
              className="ml-1 text-gray-400 hover:text-white transition-colors"
              title="Hide contest HUD"
              aria-label="Hide contest HUD"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      {expanded && (
        <div className="fixed inset-0 z-[130] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setExpanded(false)}
          />

          <div className="relative w-full max-h-[70dvh] bg-deep-space/95 backdrop-blur-md border-t border-white/10 rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-orbitron text-sm font-bold text-white truncate">
                  {contestName ?? "Contest"}
                </span>
                <Link
                  to="/contest"
                  className="text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors"
                  title="Open full Contest view"
                >
                  Full view →
                </Link>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    requestEntryFocus();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              <ContestOneLineEntry band={currentBand} mode={currentMode} />
              <ContestVoiceControls sessionId={sessionId} />

              <Card className="p-3">
                <div className="text-[11px] text-gray-400">
                  Focus entry: <span className="font-mono text-white">Alt+E</span>{" "}
                  • Voice toggle:{" "}
                  <span className="font-mono text-white">Ctrl+Shift+.</span>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ContestLiteHUD;

