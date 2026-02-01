/**
 * Contest Page - Main contest logging interface
 * Brings together all contest components for live contest operation
 */

import { useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui";
import {
  ContestScorePanel,
  ContestEntryForm,
  MultiplierTracker,
  ContestConfigModal,
  type ContestConfig,
} from "@/components/contest";
import {
  useContestStore,
  type ContestQSO,
  type MultiplierType,
} from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import { getDXCCEntity } from "@/lib/utils/multipliers";
import { useUserStore } from "@/stores/userStore";

/**
 * Map contest multiplier type to store multiplier type
 */
function mapMultiplierType(
  contestMultType: string | undefined,
): MultiplierType {
  switch (contestMultType) {
    case "cqzone":
    case "ituzone":
      return "zone";
    case "dxcc":
      return "country";
    case "state":
    case "section":
      return "state";
    case "prefix":
      return "prefix";
    case "grid":
      return "grid";
    default:
      return "zone";
  }
}

/**
 * Extract multiplier value from exchange based on contest type
 * Uses token-based parsing to handle exchanges like "599 05" correctly
 */
function extractMultiplierValue(
  exchange: string,
  multiplierType: string | undefined,
): string | null {
  if (!exchange || !multiplierType || multiplierType === "none") {
    return null;
  }

  // Split exchange into tokens
  const tokens = exchange.trim().split(/\s+/);

  // For zone-based contests, extract the LAST numeric token (zone number)
  if (multiplierType === "cqzone" || multiplierType === "ituzone") {
    // Find last token that's purely numeric
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(tokens[i])) {
        return tokens[i];
      }
    }
    // Fallback: try to extract any number
    const match = exchange.match(/\d+/);
    return match ? match[0] : null;
  }

  // For state-based contests, look for LAST 2-3 letter token (state/section)
  if (multiplierType === "state" || multiplierType === "section") {
    // Find last token that's 2-3 letters
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^[A-Z]{2,3}$/i.test(tokens[i])) {
        return tokens[i].toUpperCase();
      }
    }
    // Fallback: try to extract any 2-3 letter sequence
    const match = exchange.match(/[A-Z]{2,3}/i);
    return match ? match[0].toUpperCase() : null;
  }

  // For prefix-based contests (WPX), extract from callsign (handled separately)
  if (multiplierType === "prefix") {
    return null; // Prefix is extracted from callsign, not exchange
  }

  return null;
}

/**
 * Extract WPX prefix from a callsign
 */
function extractCallsignPrefix(callsign: string): string {
  // WPX prefix rules: Extract letters until the last digit, then include that digit
  const match = callsign.match(/^([A-Z0-9]*\d)/i);
  return match ? match[1].toUpperCase() : callsign.slice(0, 2).toUpperCase();
}

/**
 * Format time for QSO table display (HHMM)
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().slice(11, 16).replace(":", "");
}

export function Contest() {
  const {
    activeSession,
    startContest,
    endContest,
    logQSO,
    incrementSerial,
    addMultiplier,
    isDupe,
  } = useContestStore();

  // Modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Dupe checking state
  const [currentCallsign, setCurrentCallsign] = useState("");
  const [currentBand, setCurrentBand] = useState("20m");
  const [currentMode, setCurrentMode] = useState("CW");

  // Get user station for zone-based scoring
  const station = useUserStore((state) => state.station);

  // Get contest definition for the active session
  const contestDefinition = useMemo(() => {
    if (!activeSession) return null;
    return getContestById(activeSession.contestId);
  }, [activeSession]);

  // Check if current entry is a dupe
  const currentIsDupe = useMemo(() => {
    if (!currentCallsign || currentCallsign.length < 3) return false;
    return isDupe(currentCallsign, currentBand, currentMode);
  }, [currentCallsign, currentBand, currentMode, isDupe]);

  // Handle callsign change for dupe checking
  const handleCallsignChange = useCallback(
    (callsign: string, band: string, mode: string) => {
      setCurrentCallsign(callsign);
      setCurrentBand(band);
      setCurrentMode(mode);
    },
    [],
  );

  // Handle starting a new contest
  const handleStartContest = useCallback(
    (config: ContestConfig) => {
      startContest(config.contestId, config.myExchange, config.categories);
    },
    [startContest],
  );

  // Handle ending the contest
  const handleEndContest = useCallback(() => {
    endContest();
    setShowEndConfirm(false);
  }, [endContest]);

  // Handle QSO submission
  const handleQSOSubmit = useCallback(
    (qsoData: Omit<ContestQSO, "id" | "timestamp">) => {
      if (!activeSession || !contestDefinition) return;

      // Check for dupe
      const dupeCheck = isDupe(qsoData.callsign, qsoData.band, qsoData.mode);
      if (dupeCheck) return; // Don't log dupes

      // Determine multiplier
      let isNewMultiplier = false;
      let multiplierValue: string | null = null;
      const multType = contestDefinition.multiplierType;

      if (multType === "prefix") {
        // WPX-style: extract prefix from callsign
        multiplierValue = extractCallsignPrefix(qsoData.callsign);
      } else {
        // Extract from exchange
        multiplierValue = extractMultiplierValue(
          qsoData.exchangeReceived,
          multType,
        );
      }

      // Add multiplier if we found one
      if (multiplierValue && multType !== "none") {
        const storeMultType = mapMultiplierType(multType);
        const band = contestDefinition.multiplierPerBand
          ? qsoData.band
          : undefined;
        isNewMultiplier = addMultiplier(storeMultType, multiplierValue, band);
      }

      // Calculate points based on contest scoring
      let points = 1; // Default
      if (contestDefinition.scoring.mode === "fixed") {
        points = contestDefinition.scoring.fixedPoints || 1;
      } else if (contestDefinition.scoring.mode === "mixed") {
        // Mode-dependent scoring (e.g., Field Day)
        const mode = qsoData.mode.toUpperCase();
        if (mode === "CW") {
          points = contestDefinition.scoring.cwPoints || 2;
        } else if (mode === "SSB") {
          points = contestDefinition.scoring.ssbPoints || 1;
        } else {
          points = contestDefinition.scoring.digitalPoints || 2;
        }
      }
      // Zone-based scoring: compare continents/countries
      else if (contestDefinition.scoring.mode === "zone") {
        // Get DXCC info for worked station
        const workedEntity = getDXCCEntity(qsoData.callsign);
        // Get operator's DXCC info from station callsign
        const myEntity = station?.callsign
          ? getDXCCEntity(station.callsign)
          : null;

        if (workedEntity && myEntity) {
          if (workedEntity.entity === myEntity.entity) {
            // Same country - typically 0 or low points
            points = contestDefinition.scoring.sameCountry || 0;
          } else if (workedEntity.continent === myEntity.continent) {
            // Same continent - medium points
            points = contestDefinition.scoring.sameContinent || 1;
          } else {
            // Different continent - maximum points
            points = contestDefinition.scoring.diffContinent || 3;
          }
        } else {
          // Fallback if we can't determine location
          points = contestDefinition.scoring.diffContinent || 3;
        }
      }

      // Get serial number
      const serialSent = incrementSerial();

      // Create the QSO object
      const qso: ContestQSO = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        callsign: qsoData.callsign,
        band: qsoData.band,
        mode: qsoData.mode,
        rstSent: qsoData.rstSent,
        rstReceived: qsoData.rstReceived,
        exchangeSent: qsoData.exchangeSent,
        exchangeReceived: qsoData.exchangeReceived,
        serialSent,
        points,
        isMultiplier: isNewMultiplier,
        multipliers:
          isNewMultiplier && multiplierValue ? [multiplierValue] : undefined,
      };

      logQSO(qso);

      // Reset dupe check state
      setCurrentCallsign("");
    },
    [
      activeSession,
      contestDefinition,
      isDupe,
      addMultiplier,
      incrementSerial,
      logQSO,
    ],
  );

  // Get recent QSOs (last 20, newest first)
  const recentQSOs = useMemo(() => {
    if (!activeSession) return [];
    return [...activeSession.qsos].reverse().slice(0, 20);
  }, [activeSession]);

  // Get multiplier type for tracker
  const multiplierType = useMemo(() => {
    if (!contestDefinition) return "zone" as MultiplierType;
    return mapMultiplierType(contestDefinition.multiplierType);
  }, [contestDefinition]);

  // Render no contest active state
  if (!activeSession) {
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
            <p className="text-gray-400 text-sm">
              {contestDefinition?.name || activeSession.contestId}
            </p>
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

        {/* Score Panel */}
        <ContestScorePanel session={activeSession} />

        {/* Entry Form and Multiplier Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Entry Form - takes 2 columns */}
          <div className="lg:col-span-2">
            <ContestEntryForm
              session={activeSession}
              isDupe={currentIsDupe}
              onSubmit={handleQSOSubmit}
              onCallsignChange={handleCallsignChange}
            />
          </div>

          {/* Multiplier Tracker */}
          <div className="lg:col-span-1">
            <MultiplierTracker
              multipliers={activeSession.multipliers}
              type={multiplierType}
            />
          </div>
        </div>

        {/* Recent QSOs Table */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-orbitron text-sm font-bold text-white">
              Recent QSOs
            </h3>
            <span className="text-xs text-gray-400">
              Showing last 20 of {activeSession.qsos.length}
            </span>
          </div>

          {recentQSOs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No QSOs logged yet. Start making contacts!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-white/10">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Call</th>
                    <th className="pb-2 pr-4 font-medium">Exch</th>
                    <th className="pb-2 pr-4 font-medium">Band</th>
                    <th className="pb-2 pr-4 font-medium">Mode</th>
                    <th className="pb-2 pr-4 font-medium text-right">Pts</th>
                    <th className="pb-2 font-medium">Mult</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {recentQSOs.map((qso) => (
                    <tr
                      key={qso.id}
                      className="border-b border-white/5 hover:bg-white/5"
                    >
                      <td className="py-2 pr-4 text-gray-400">
                        {formatTime(qso.timestamp)}
                      </td>
                      <td className="py-2 pr-4 text-white font-bold">
                        {qso.callsign}
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        {qso.exchangeReceived}
                      </td>
                      <td className="py-2 pr-4 text-cosmic-cyan">{qso.band}</td>
                      <td className="py-2 pr-4 text-gray-400">{qso.mode}</td>
                      <td className="py-2 pr-4 text-right text-plasma-orange">
                        {qso.points}
                      </td>
                      <td className="py-2">
                        {qso.isMultiplier && qso.multipliers?.[0] && (
                          <span className="inline-flex items-center gap-1 text-signal-green">
                            <svg
                              className="w-3 h-3"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {qso.multipliers[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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
                <span className="text-white font-bold">
                  {activeSession.qsos.length}
                </span>{" "}
                QSOs and a score of{" "}
                <span className="text-plasma-orange font-bold">
                  {activeSession.totalScore.toLocaleString()}
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
