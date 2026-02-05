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
import { ContestRunControls } from "@/components/contest/ContestRunControls";
import { PendingDraftReplaceBanner } from "@/components/contest/PendingDraftReplaceBanner";
import { EndContestModal } from "@/components/contest/EndContestModal";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import { getContestById } from "@/lib/data/contests";
import { useSpotEntryBehavior } from "@/hooks/useSpotEntryBehavior";
import { formatDeltaSince } from "@/lib/utils/time";

export interface ContestDockProps {
  className?: string;
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
  const requestEntryFocus = useContestUIEphemeralStore(
    (s) => s.requestEntryFocus,
  );
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

  const handleSpotClick = useSpotEntryBehavior({
    sessionId,
    runMode,
    draft,
    draftHasFocus,
    draftUpdatedAt,
    spotPrefillInRun,
    adoptBandFromSpot,
    adoptModeFromSpot,
    focusEntryOnSpotPrefill,
    setSelectedSpot,
    setTarget,
    setBand,
    setMode,
    setDraft,
    requestEntryFocus,
    requestDraftReplace,
  });

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

          <ContestRunControls
            runMode={runMode}
            onRunModeChange={setRunMode}
            sessionId={sessionId}
            currentBand={currentBand}
            currentMode={currentMode}
            onBandChange={(band) => {
              if (!sessionId) {
                return;
              }
              setBand(sessionId, band);
            }}
            onModeChange={(mode) => {
              if (!sessionId) {
                return;
              }
              setMode(sessionId, mode);
            }}
            onFocusEntry={requestEntryFocus}
            onEndSession={() => setShowEndConfirm(true)}
          />
        </div>

        {/* Prefill safeguards */}
        <PendingDraftReplaceBanner
          sessionId={sessionId}
          pendingDraftReplace={pendingDraftReplace}
          draft={draft}
          onConfirm={confirmDraftReplace}
          onCancel={cancelDraftReplace}
        />

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

      <EndContestModal
        isOpen={showEndConfirm}
        onCancel={() => setShowEndConfirm(false)}
        onConfirm={() => {
          endContest();
          setShowEndConfirm(false);
        }}
      />

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
