/**
 * ContestDock
 *
 * Embedded contest surface optimized for PropSphere ("map-first contesting").
 * Shares the same contest session + one-line draft as /contest.
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import {
  ContestConfigModal,
  ContestOneLineEntry,
  ContestSpotsPanel,
  ContestBandMap,
  type ContestConfig,
} from "@/components/contest";
import { ContestVoiceControls } from "@/components/contest/ContestVoiceControls";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import { getContestById } from "@/lib/data/contests";
import type { DXSpot } from "@/types/dxcluster";

export interface ContestDockProps {
  className?: string;
}

function formatDeltaSince(timestampIso: string): string {
  const deltaMs = Date.now() - new Date(timestampIso).getTime();
  const deltaSec = Math.max(0, Math.floor(deltaMs / 1000));
  const minutes = Math.floor(deltaSec / 60);
  const seconds = deltaSec % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}h${remMin.toString().padStart(2, "0")}m`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ContestDock({ className = "" }: ContestDockProps) {
  const activeSession = useContestStore((s) => s.activeSession);
  const startContest = useContestStore((s) => s.startContest);
  const endContest = useContestStore((s) => s.endContest);
  const setRunMode = useContestStore((s) => s.setRunMode);

  const setTarget = useMapStore((s) => s.setTarget);
  const setSelectedSpot = useDXStore((s) => s.setSelectedSpot);

  const sessionId = activeSession?.id ?? null;

  const currentBand = useContestUIStore((s) =>
    sessionId ? s.bandBySessionId[sessionId] ?? "20m" : "20m",
  );
  const currentMode = useContestUIStore((s) =>
    sessionId ? s.modeBySessionId[sessionId] ?? "CW" : "CW",
  );
  const setBand = useContestUIStore((s) => s.setBand);
  const setMode = useContestUIStore((s) => s.setMode);

  const draft = useContestUIStore((s) =>
    sessionId ? s.draftBySessionId[sessionId] ?? "" : "",
  );
  const draftHasFocus = useContestUIStore((s) =>
    sessionId ? s.draftHasFocusBySessionId[sessionId] ?? false : false,
  );
  const draftUpdatedAt = useContestUIStore((s) =>
    sessionId ? s.draftUpdatedAtBySessionId[sessionId] ?? 0 : 0,
  );

  const spotPrefillInRun = useContestUIStore((s) => s.spotPrefillInRun);
  const adoptBandFromSpot = useContestUIStore((s) => s.adoptBandFromSpot);
  const adoptModeFromSpot = useContestUIStore((s) => s.adoptModeFromSpot);
  const focusEntryOnSpotPrefill = useContestUIStore(
    (s) => s.focusEntryOnSpotPrefill,
  );
  const setSpotPrefillInRun = useContestUIStore((s) => s.setSpotPrefillInRun);
  const setAdoptBandFromSpot = useContestUIStore((s) => s.setAdoptBandFromSpot);
  const setAdoptModeFromSpot = useContestUIStore((s) => s.setAdoptModeFromSpot);
  const setFocusEntryOnSpotPrefill = useContestUIStore(
    (s) => s.setFocusEntryOnSpotPrefill,
  );
  const requestEntryFocus = useContestUIStore((s) => s.requestEntryFocus);
  const pendingDraftReplace = useContestUIStore((s) => s.pendingDraftReplace);
  const requestDraftReplace = useContestUIStore((s) => s.requestDraftReplace);
  const confirmDraftReplace = useContestUIStore((s) => s.confirmDraftReplace);
  const cancelDraftReplace = useContestUIStore((s) => s.cancelDraftReplace);
  const setDraft = useContestUIStore((s) => s.setDraft);

  // Local modal state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const contestName = useMemo(() => {
    if (!activeSession) {
      return null;
    }
    const def = getContestById(activeSession.contestId);
    return def?.name ?? activeSession.contestId;
  }, [activeSession]);

  const lastQso = activeSession?.qsos.length
    ? activeSession.qsos[activeSession.qsos.length - 1]
    : null;

  const runMode = activeSession?.runMode ?? "run";

  const handleStartContest = useCallback(
    (config: ContestConfig) => {
      startContest(
        config.contestId,
        config.myExchange,
        config.categories,
        config.cabrilloMeta,
      );
      setShowConfigModal(false);
    },
    [startContest],
  );

  const handleSpotClick = useCallback(
    (spot: DXSpot) => {
      // Map targeting + selection are always safe
      setSelectedSpot(spot);
      if (typeof spot.dxLat === "number" && typeof spot.dxLon === "number") {
        setTarget({
          lat: spot.dxLat,
          lon: spot.dxLon,
          grid: spot.dxGrid,
          name: spot.dx,
        });
      }

      if (!sessionId) {
        return;
      }

      const shouldPrefill =
        runMode === "sp" || (runMode === "run" && spotPrefillInRun);

      if (!shouldPrefill) {
        if (focusEntryOnSpotPrefill) {
          requestEntryFocus();
        }
        return;
      }

      if (adoptBandFromSpot && spot.band) {
        setBand(sessionId, spot.band);
      }
      if (adoptModeFromSpot && spot.mode) {
        setMode(sessionId, spot.mode);
      }

      const nextDraft = spot.dx.toUpperCase();
      const isActivelyTyping =
        draft.trim().length > 0 &&
        (draftHasFocus || Date.now() - draftUpdatedAt < 15_000);

      if (isActivelyTyping && draft.toUpperCase() !== nextDraft) {
        requestDraftReplace({
          sessionId,
          nextText: nextDraft,
          source: "spot",
        });
      } else {
        setDraft(sessionId, nextDraft);
      }

      if (focusEntryOnSpotPrefill) {
        requestEntryFocus();
      }
    },
    [
      adoptBandFromSpot,
      adoptModeFromSpot,
      draft,
      draftHasFocus,
      draftUpdatedAt,
      focusEntryOnSpotPrefill,
      requestDraftReplace,
      requestEntryFocus,
      runMode,
      sessionId,
      setBand,
      setDraft,
      setMode,
      setSelectedSpot,
      setTarget,
      spotPrefillInRun,
    ],
  );

  if (!activeSession) {
    return (
      <div className={`h-full p-4 ${className}`}>
        <Card className="p-6 h-full flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <h3 className="font-orbitron text-lg font-bold text-white">
              No Contest Active
            </h3>
            <p className="text-gray-400 text-sm">
              Start a contest session to enable the Contest dock inside
              PropSphere.
            </p>
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-6 py-2.5 bg-plasma-orange text-deep-space font-bold rounded-lg
                         hover:bg-plasma-orange/90 shadow-[0_0_20px_rgba(255,170,0,0.25)]
                         transition-all duration-200"
            >
              Start Contest
            </button>
          </div>
        </Card>

        <ContestConfigModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onStart={handleStartContest}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Entry strip */}
      <div className="p-4 border-b border-white/10 bg-black/20">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-orbitron text-sm font-bold text-white">
                {contestName ?? "Contest"}
              </span>
              <Link
                to="/contest"
                className="text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors"
                title="Open full Contest view"
              >
                Open full view →
              </Link>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span>
                QSOs{" "}
                <span className="text-white font-mono">
                  {activeSession.qsos.length}
                </span>
              </span>
              <span>
                Mults{" "}
                <span className="text-white font-mono">
                  {activeSession.totalMultipliers}
                </span>
              </span>
              <span>
                Score{" "}
                <span className="text-plasma-orange font-mono font-bold">
                  {activeSession.totalScore.toLocaleString()}
                </span>
              </span>
              {lastQso && (
                <span>
                  Last{" "}
                  <span className="text-white font-mono">
                    {formatDeltaSince(lastQso.timestamp)}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Run / S&P mode */}
            <div className="flex items-center bg-black/30 border border-white/10 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setRunMode("run")}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  runMode === "run"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title="Run mode"
              >
                RUN
              </button>
              <button
                type="button"
                onClick={() => setRunMode("sp")}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  runMode === "sp"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title="Search & Pounce mode"
              >
                S&amp;P
              </button>
            </div>

            {/* Band / Mode quick selects */}
            <select
              value={currentBand}
              onChange={(e) => sessionId && setBand(sessionId, e.target.value)}
              className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-cosmic-cyan font-mono text-xs focus:outline-none cursor-pointer"
              title="Operating band"
            >
              {["160m", "80m", "40m", "20m", "15m", "10m", "6m", "2m"].map(
                (b) => (
                  <option key={b} value={b} className="bg-deep-space">
                    {b}
                  </option>
                ),
              )}
            </select>
            <select
              value={currentMode}
              onChange={(e) => sessionId && setMode(sessionId, e.target.value)}
              className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-white font-mono text-xs focus:outline-none cursor-pointer"
              title="Operating mode"
            >
              {["CW", "SSB", "RTTY", "FT8"].map((m) => (
                <option key={m} value={m} className="bg-deep-space">
                  {m}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => requestEntryFocus()}
              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
              title="Focus entry (Alt+E)"
            >
              Focus
            </button>

            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="px-3 py-1 rounded-lg bg-alert-red/15 border border-alert-red/40 text-alert-red hover:bg-alert-red/25 transition-colors text-xs font-bold"
              title="End contest session"
            >
              End
            </button>
          </div>
        </div>

        {/* Prefill safeguards */}
        {pendingDraftReplace && pendingDraftReplace.sessionId === sessionId && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-plasma-orange/10 border border-plasma-orange/30 flex items-center gap-3">
            <div className="text-xs text-gray-200">
              Replace current draft{" "}
              <span className="font-mono text-white">{draft || "(empty)"}</span>{" "}
              with{" "}
              <span className="font-mono text-plasma-orange">
                {pendingDraftReplace.nextText}
              </span>
              ?
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={confirmDraftReplace}
                className="px-2 py-1 rounded bg-plasma-orange/25 text-plasma-orange border border-plasma-orange/40 hover:bg-plasma-orange/35 transition-colors text-xs font-bold"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={cancelDraftReplace}
                className="px-2 py-1 rounded bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white transition-colors text-xs"
              >
                Keep
              </button>
            </div>
          </div>
        )}

        {/* Lightweight toggles */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
          <button
            type="button"
            onClick={() => setSpotPrefillInRun(!spotPrefillInRun)}
            className={`px-2 py-1 rounded border transition-colors ${
              spotPrefillInRun
                ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40"
                : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
            }`}
            title="Allow spot click to prefill even in RUN mode"
          >
            Prefill in RUN
          </button>
          <button
            type="button"
            onClick={() => setAdoptBandFromSpot(!adoptBandFromSpot)}
            className={`px-2 py-1 rounded border transition-colors ${
              adoptBandFromSpot
                ? "bg-cosmic-cyan/15 text-cosmic-cyan border-cosmic-cyan/40"
                : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
            }`}
            title="Adopt spot band when prefilling"
          >
            Adopt band
          </button>
          <button
            type="button"
            onClick={() => setAdoptModeFromSpot(!adoptModeFromSpot)}
            className={`px-2 py-1 rounded border transition-colors ${
              adoptModeFromSpot
                ? "bg-cosmic-cyan/15 text-cosmic-cyan border-cosmic-cyan/40"
                : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
            }`}
            title="Adopt spot mode when prefilling"
          >
            Adopt mode
          </button>
          <button
            type="button"
            onClick={() => setFocusEntryOnSpotPrefill(!focusEntryOnSpotPrefill)}
            className={`px-2 py-1 rounded border transition-colors ${
              focusEntryOnSpotPrefill
                ? "bg-white/10 text-white border-white/20"
                : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
            }`}
            title="Refocus entry after spot click/prefill"
          >
            Keep focus
          </button>
        </div>

        {/* Entry + Voice controls */}
        <div className="mt-4 grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 items-start">
          <ContestOneLineEntry band={currentBand} mode={currentMode} />
          {sessionId && <ContestVoiceControls sessionId={sessionId} />}
        </div>
      </div>

      {/* Work area */}
      <div className="flex-1 min-h-0 p-4">
        <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0">
          <ContestSpotsPanel
            currentBand={currentBand}
            currentMode={currentMode}
            onSpotClick={handleSpotClick}
            className="h-full"
          />
          <ContestBandMap
            currentBand={currentBand}
            currentMode={currentMode}
            onSpotSelect={() => {
              // Prefer the richer onSpotClick callback for targeting + prefill rules.
            }}
            onSpotClick={handleSpotClick}
            className="h-full"
          />
        </div>
      </div>

      {/* End confirm */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEndConfirm(false)}
          />
          <Card className="relative z-10 w-full max-w-md p-6" animate>
            <div className="text-center space-y-4">
              <h3 className="text-lg font-orbitron font-bold text-white">
                End Contest Session?
              </h3>
              <p className="text-gray-400 text-sm">
                This will end your current session and move it to history.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                             text-gray-300 hover:text-white hover:border-white/20
                             transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    endContest();
                    setShowEndConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 bg-alert-red/20 border border-alert-red/50 rounded-lg
                             text-alert-red hover:bg-alert-red/30
                             transition-colors font-bold"
                >
                  End Contest
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Config modal (start new contest while active) */}
      <ContestConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onStart={handleStartContest}
      />
    </div>
  );
}

export default ContestDock;
