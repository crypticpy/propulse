/**
 * Contest Page - Main contest logging interface
 * Composable layout using modular panels for contest operation
 *
 * Phase 3 update: Keyboard-first entry with hotkeys and ESM support
 * Phase 5 update: Contest timer with off-time tracking
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Card } from "@/components/ui";
import {
  ContestScoreboard,
  ContestOneLineEntry,
  ContestMultiplierPanel,
  ContestQSOTable,
  ContestConfigModal,
  ContestEditLastModal,
  ContestTimer,
  ContestRateSheet,
  type ContestConfig,
} from "@/components/contest";
import { MobileContestEntry } from "@/components/contest/MobileContestEntry";
import { ContestScoreShare } from "@/components/contest/ContestScoreShare";
import { ContestVoiceControls } from "@/components/contest/ContestVoiceControls";
import { BandReadinessStrip } from "@/components/contest/BandReadinessStrip";
import { CabrilloExportModal } from "@/components/contest/CabrilloExportModal";
import { AuditQueuePanel } from "@/components/contest/AuditQueuePanel";
import type { OffTimeRules } from "@/lib/contest/offTimeTracker";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import {
  useContestHotkeys,
  BAND_QUICK_SELECT,
} from "@/hooks/useContestHotkeys";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRigStore } from "@/stores/rigStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { HelpTooltip } from "@/components/help/HelpTooltip";

const EMPTY_QSOS: ContestQSO[] = [];

/**
 * Map rig mode strings to contest-compatible mode labels.
 * Contest selectors use: CW, SSB, RTTY, FT8
 */
function rigModeToContestMode(rigMode: string): string {
  switch (rigMode) {
    case "CW":
    case "CW-R":
      return "CW";
    case "LSB":
    case "USB":
    case "AM":
    case "FM":
      return "SSB";
    case "RTTY":
    case "RTTY-R":
      return "RTTY";
    case "FT8":
    case "FT4":
    case "DATA":
    case "DATA-R":
    case "PSK":
      return "FT8";
    default:
      return "SSB";
  }
}

/**
 * Contest Page Component
 * Composes all contest panels into a unified interface with keyboard-first operation
 */
export function Contest() {
  const isMobile = useIsMobile();

  // CAT control state
  const rigConnected = useRigStore((s) => s.connected);
  const rigCatEnabled = useRigStore((s) => s.catEnabled);
  const rigBand = useRigStore((s) => s.band);
  const rigMode = useRigStore((s) => s.mode);
  const catActive = rigCatEnabled && rigConnected;

  // Narrow selectors to minimize re-renders
  const hasActiveSession = useContestStore((s) => s.activeSession !== null);
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const qsoCount = useContestStore((s) => s.activeSession?.qsos.length ?? 0);
  const totalScore = useContestStore((s) => s.activeSession?.totalScore ?? 0);
  const qsos = useContestStore((s) => s.activeSession?.qsos) ?? EMPTY_QSOS;
  const runMode = useContestStore((s) => s.activeSession?.runMode ?? "run");
  const sessionStartTime = useContestStore(
    (s) => s.activeSession?.startTime ?? null,
  );
  const sessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const startContest = useContestStore((s) => s.startContest);
  const endContest = useContestStore((s) => s.endContest);
  const undoLastQSO = useContestStore((s) => s.undoLastQSO);

  // Modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [editingQSO, setEditingQSO] = useState<ContestQSO | null>(null);
  const [showCabrilloExport, setShowCabrilloExport] = useState(false);

  // Band and mode UI state (shared across /contest and /map via contestUIStore)
  // CAT-driven when rig is connected
  const currentBand = useContestUIStore((s) =>
    sessionId ? (s.bandBySessionId[sessionId] ?? "20m") : "20m",
  );
  const currentMode = useContestUIStore((s) =>
    sessionId ? (s.modeBySessionId[sessionId] ?? "CW") : "CW",
  );
  const setBand = useContestUIStore((s) => s.setBand);
  const setMode = useContestUIStore((s) => s.setMode);

  // Convenience wrappers that also update the shared UI store
  const setCurrentBand = useCallback(
    (band: string) => {
      if (sessionId) setBand(sessionId, band);
    },
    [sessionId, setBand],
  );
  const setCurrentMode = useCallback(
    (mode: string) => {
      if (sessionId) setMode(sessionId, mode);
    },
    [sessionId, setMode],
  );

  // Sync band/mode from CAT when rig is connected and CAT is enabled
  useEffect(() => {
    if (catActive) {
      setCurrentBand(rigBand);
      setCurrentMode(rigModeToContestMode(rigMode));
    }
  }, [catActive, rigBand, rigMode, setCurrentBand, setCurrentMode]);

  // Get contest name
  const contestName = useMemo(() => {
    if (!contestId) {
      return null;
    }
    const def = getContestById(contestId);
    return def?.name ?? contestId;
  }, [contestId]);

  // Derive contest timer data from session and contest definition
  const contestTimerData = useMemo(() => {
    if (!contestId || !sessionStartTime) return null;
    const def = getContestById(contestId);
    if (!def) return null;

    const contestStart = new Date(sessionStartTime);
    const contestEnd = new Date(
      contestStart.getTime() + def.durationHours * 60 * 60 * 1000,
    );

    // Build off-time rules for single-op categories with limited operating time
    // Standard rules: CQWW single-op = 36h operating in 48h contest
    // Default: no off-time rules (unlimited operating)
    let offTimeRules: OffTimeRules | undefined;
    if (def.durationHours === 48) {
      // 48-hour contests typically allow 36 hours for single-op
      offTimeRules = {
        maxOperatingHours: 36,
        contestDurationHours: 48,
        minOffTimePeriodMinutes: 60,
      };
    } else if (def.durationHours === 30) {
      // 30-hour contests (e.g., Sweepstakes) allow 24 hours
      offTimeRules = {
        maxOperatingHours: 24,
        contestDurationHours: 30,
        minOffTimePeriodMinutes: 30,
      };
    }

    return { contestStart, contestEnd, offTimeRules };
  }, [contestId, sessionStartTime]);

  // QSO timestamps for off-time calculation
  const qsoTimestamps = useMemo(() => {
    return qsos.map((qso) => new Date(qso.timestamp).getTime());
  }, [qsos]);

  // Get last QSO for edit functionality
  const lastQSO = useMemo(() => {
    return qsos.length > 0 ? qsos[qsos.length - 1] : null;
  }, [qsos]);

  // Handle starting a new contest
  const handleStartContest = useCallback(
    (config: ContestConfig) => {
      startContest(
        config.contestId,
        config.myExchange,
        config.categories,
        config.cabrilloMeta,
      );
    },
    [startContest],
  );

  // Handle ending the contest
  const handleEndContest = useCallback(() => {
    endContest();
    setShowEndConfirm(false);
  }, [endContest]);

  // Handle QSO edit click from table
  const handleEditQSO = useCallback((qso: ContestQSO) => {
    setEditingQSO(qso);
  }, []);

  // Handle edit modal close
  const handleCloseEditModal = useCallback(() => {
    setEditingQSO(null);
    // ContestOneLineEntry auto-focuses on render
  }, []);

  // Hotkey callbacks
  const handleWipeInput = useCallback(() => {
    // ContestOneLineEntry handles Escape key internally
    // This callback is provided for consistency with useContestHotkeys interface
  }, []);

  const handleEditLast = useCallback(() => {
    if (lastQSO) {
      setEditingQSO(lastQSO);
    }
  }, [lastQSO]);

  const handleUndoLast = useCallback(() => {
    undoLastQSO();
    // ContestOneLineEntry maintains focus automatically
  }, [undoLastQSO]);

  const handleBandChange = useCallback(
    (band: string) => {
      if (!sessionId) {
        return;
      }
      setBand(sessionId, band);
    },
    [sessionId, setBand],
  );

  const handleMacro = useCallback((_macroName: string) => {
    // Macro triggering deferred to Phase 7 (CAT integration)
    // For v1, macros are displayed in hotkey hints but don't send
  }, []);

  // Set up contest hotkeys
  useContestHotkeys({
    enabled:
      hasActiveSession && !showConfigModal && !showEndConfirm && !editingQSO,
    mode: runMode,
    callbacks: {
      onWipeInput: handleWipeInput,
      onEditLast: handleEditLast,
      onUndoLast: handleUndoLast,
      onBandChange: handleBandChange,
      onMacro: handleMacro,
    },
  });

  // Render no contest active state
  if (!hasActiveSession) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
                  Contest
                </h1>
                <HelpTooltip
                  section="contest"
                  tooltip="Learn more about Contest mode"
                />
              </div>
              <p className="text-gray-400 text-sm">No active contest session</p>
            </div>
          </div>

          {/* No Contest Card */}
          <Card className="p-12">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-plasma-orange/10 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-plasma-orange"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-orbitron font-bold text-white mb-2">
                  No Contest Active
                </h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  Start a contest session to begin logging QSOs with live
                  scoring, multiplier tracking, and rate calculations.
                </p>
              </div>
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-8 py-3 bg-plasma-orange text-deep-space font-bold rounded-lg
                           hover:bg-plasma-orange/90 shadow-[0_0_20px_rgba(255,170,0,0.3)]
                           transition-all duration-200"
              >
                Start Contest
              </button>
            </div>
          </Card>
        </div>

        {/* Config Modal */}
        <ContestConfigModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onStart={handleStartContest}
        />
      </div>
    );
  }

  // Render mobile contest view for small screens
  if (isMobile && hasActiveSession) {
    return <MobileContestEntry />;
  }

  // Render active contest
  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
                Contest
              </h1>
              <HelpTooltip
                section="contest"
                tooltip="Learn more about Contest mode"
              />
            </div>
            <p className="text-gray-400 text-sm">{contestName}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Contest Timer (compact mode in header) */}
            {contestTimerData && (
              <ContestTimer
                contestStart={contestTimerData.contestStart}
                contestEnd={contestTimerData.contestEnd}
                offTimeRules={contestTimerData.offTimeRules}
                qsoTimestamps={qsoTimestamps}
                compact
              />
            )}

            {/* Band/Mode quick-select display */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-nebula-blue rounded-lg border border-white/10">
              {catActive && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-signal-green/20 text-signal-green border border-signal-green/30">
                  CAT
                </span>
              )}
              <select
                value={currentBand}
                onChange={(e) => setCurrentBand(e.target.value)}
                disabled={catActive}
                className={`bg-transparent font-mono text-sm focus:outline-none ${
                  catActive
                    ? "text-cosmic-cyan/70 cursor-not-allowed"
                    : "text-cosmic-cyan cursor-pointer"
                }`}
              >
                {Object.values(BAND_QUICK_SELECT).map((band) => (
                  <option key={band} value={band} className="bg-deep-space">
                    {band}
                  </option>
                ))}
              </select>
              <span className="text-gray-500">/</span>
              <select
                value={currentMode}
                onChange={(e) => setCurrentMode(e.target.value)}
                disabled={catActive}
                className={`bg-transparent font-mono text-sm focus:outline-none ${
                  catActive
                    ? "text-white/70 cursor-not-allowed"
                    : "text-white cursor-pointer"
                }`}
              >
                <option value="CW" className="bg-deep-space">
                  CW
                </option>
                <option value="SSB" className="bg-deep-space">
                  SSB
                </option>
                <option value="RTTY" className="bg-deep-space">
                  RTTY
                </option>
                <option value="FT8" className="bg-deep-space">
                  FT8
                </option>
              </select>
            </div>

            <button
              onClick={() => setShowCabrilloExport(true)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg
                         text-gray-300 hover:text-white hover:bg-white/10
                         transition-colors flex items-center gap-2 font-medium"
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
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export
            </button>

            <button
              onClick={() => setShowEndConfirm(true)}
              className="px-4 py-2 bg-alert-red/20 border border-alert-red/50 rounded-lg
                         text-alert-red font-semibold hover:bg-alert-red/30
                         transition-colors flex items-center gap-2"
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
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
              End Contest
            </button>
          </div>
        </div>

        {/* Band Readiness Strip */}
        <BandReadinessStrip
          currentBand={currentBand}
          onBandClick={setCurrentBand}
        />

        {/* Scoreboard + Timer Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <ContestScoreboard />
          </div>
          {/* Full Contest Timer with off-time tracking */}
          {contestTimerData && (
            <ContestTimer
              contestStart={contestTimerData.contestStart}
              contestEnd={contestTimerData.contestEnd}
              offTimeRules={contestTimerData.offTimeRules}
              qsoTimestamps={qsoTimestamps}
            />
          )}
        </div>

        {/* One-Line Entry and Multiplier Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* One-Line Entry - takes 2 columns */}
          <div className="lg:col-span-2">
            <ContestOneLineEntry
              band={currentBand}
              mode={currentMode}
              onBandModeChange={(band, mode) => {
                setCurrentBand(band);
                setCurrentMode(mode);
              }}
            />
            {sessionId && (
              <ContestVoiceControls sessionId={sessionId} className="mt-3" />
            )}
          </div>

          {/* Multiplier Panel */}
          <ContestMultiplierPanel className="lg:col-span-1" />
        </div>

        {/* QSO Table */}
        <ContestQSOTable maxRows={20} onEditQSO={handleEditQSO} />

        {/* Audit Queue (flagged QSOs) */}
        {qsoCount > 0 && (
          <AuditQueuePanel maxItems={5} onEditQSO={handleEditQSO} />
        )}

        {/* Rate Sheet (only renders when QSOs exist) */}
        {qsoCount > 0 && <ContestRateSheet />}

        {/* Score Share (only renders when QSOs exist) */}
        {qsoCount > 0 && <ContestScoreShare />}

        {/* Keyboard shortcuts hint */}
        <div className="text-xs text-gray-500 flex flex-wrap items-center gap-4 justify-center">
          <span>
            <kbd className="px-1 py-0.5 bg-white/10 rounded">Enter</kbd> Log
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-white/10 rounded">Esc</kbd> Clear
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-white/10 rounded">Ctrl+Z</kbd> Undo
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-white/10 rounded">Ctrl+E</kbd> Edit
            Last
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-white/10 rounded">Alt+1-9</kbd> Band
          </span>
        </div>
      </div>

      {/* End Contest Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEndConfirm(false)}
          />
          <Card className="relative z-10 w-full max-w-md p-6" animate>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-alert-red/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-alert-red"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-orbitron font-bold text-white">
                End Contest Session?
              </h3>
              <p className="text-gray-400 text-sm">
                This will end your current contest session with{" "}
                <span className="text-white font-bold">{qsoCount}</span> QSOs
                and a score of{" "}
                <span className="text-plasma-orange font-bold">
                  {totalScore.toLocaleString()}
                </span>
                . The session will be saved to your history.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                             text-gray-300 hover:text-white hover:border-white/20
                             transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndContest}
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

      {/* Edit QSO Modal */}
      <ContestEditLastModal
        isOpen={editingQSO !== null}
        onClose={handleCloseEditModal}
        qso={editingQSO}
      />

      {/* Config Modal (for starting new contest while one is active) */}
      <ContestConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onStart={handleStartContest}
      />

      {/* Cabrillo Export Modal */}
      <CabrilloExportModal
        isOpen={showCabrilloExport}
        onClose={() => setShowCabrilloExport(false)}
      />
    </div>
  );
}

export default Contest;
