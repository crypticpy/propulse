/**
 * Contest Page - Main contest logging interface
 * Composable layout using modular panels for contest operation
 *
 * Phase 2 refactor: Now uses composable panels with narrow Zustand selectors
 * for minimal re-renders and better code organization.
 */

import { useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui";
import {
  ContestScoreboard,
  ContestEntryArea,
  ContestMultiplierPanel,
  ContestQSOTable,
  ContestConfigModal,
  type ContestConfig,
} from "@/components/contest";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";

/**
 * Contest Page Component
 * Composes all contest panels into a unified interface
 */
export function Contest() {
  // Narrow selectors to minimize re-renders
  const hasActiveSession = useContestStore((s) => s.activeSession !== null);
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const qsoCount = useContestStore((s) => s.activeSession?.qsos.length ?? 0);
  const totalScore = useContestStore((s) => s.activeSession?.totalScore ?? 0);
  const startContest = useContestStore((s) => s.startContest);
  const endContest = useContestStore((s) => s.endContest);

  // Modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [editingQSO, setEditingQSO] = useState<ContestQSO | null>(null);

  // Get contest name
  const contestName = useMemo(() => {
    if (!contestId) return null;
    const def = getContestById(contestId);
    return def?.name ?? contestId;
  }, [contestId]);

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

  // Handle QSO edit click
  const handleEditQSO = useCallback((qso: ContestQSO) => {
    setEditingQSO(qso);
    // TODO: Open edit modal in Phase 3
    console.log("Edit QSO:", qso.callsign);
  }, []);

  // Render no contest active state
  if (!hasActiveSession) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
                Contest
              </h1>
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

  // Render active contest
  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
              Contest
            </h1>
            <p className="text-gray-400 text-sm">{contestName}</p>
          </div>

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

        {/* Scoreboard Panel */}
        <ContestScoreboard />

        {/* Entry Form and Multiplier Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Entry Area - takes 2 columns */}
          <ContestEntryArea className="lg:col-span-2" />

          {/* Multiplier Panel */}
          <ContestMultiplierPanel className="lg:col-span-1" />
        </div>

        {/* QSO Table */}
        <ContestQSOTable maxRows={20} onEditQSO={handleEditQSO} />
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

      {/* Edit QSO Modal Placeholder (Phase 3) */}
      {editingQSO && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditingQSO(null)}
          />
          <Card className="relative z-10 w-full max-w-md p-6" animate>
            <div className="space-y-4">
              <h3 className="text-lg font-orbitron font-bold text-white">
                Edit QSO
              </h3>
              <p className="text-gray-400 text-sm">
                Edit modal will be implemented in Phase 3
              </p>
              <div className="bg-nebula-blue/50 p-3 rounded-lg font-mono text-sm">
                <div className="text-white font-bold">
                  {editingQSO.callsign}
                </div>
                <div className="text-gray-400">
                  {editingQSO.band} {editingQSO.mode}
                </div>
                <div className="text-gray-400">
                  {editingQSO.exchangeReceived}
                </div>
              </div>
              <button
                onClick={() => setEditingQSO(null)}
                className="w-full px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                           text-gray-300 hover:text-white hover:border-white/20
                           transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Config Modal (for starting new contest while one is active) */}
      <ContestConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onStart={handleStartContest}
      />
    </div>
  );
}

export default Contest;
