/**
 * ContestEntryArea - Composable entry panel for contest QSOs
 * Placeholder wrapper for entry form, will be replaced by one-line entry in Phase 3
 */

import { useState, useCallback, useMemo } from "react";
import { ContestEntryForm } from "./ContestEntryForm";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import { getDXCCEntity } from "@/lib/utils/multipliers";
import { useUserStore } from "@/stores/userStore";

/**
 * Extract WPX prefix from a callsign
 */
function extractCallsignPrefix(callsign: string): string {
  const match = callsign.match(/^([A-Z0-9]*\d)/i);
  return match ? match[1].toUpperCase() : callsign.slice(0, 2).toUpperCase();
}

/**
 * Extract multiplier value from exchange based on contest type
 */
function extractMultiplierValue(
  exchange: string,
  multiplierType: string | undefined,
): string | null {
  if (!exchange || !multiplierType || multiplierType === "NONE") {
    return null;
  }

  const tokens = exchange.trim().split(/\s+/);

  if (multiplierType === "CQ_ZONE" || multiplierType === "ITU_ZONE") {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(tokens[i])) {
        return tokens[i];
      }
    }
    const match = exchange.match(/\d+/);
    return match ? match[0] : null;
  }

  if (multiplierType === "STATE" || multiplierType === "SECTION") {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^[A-Z]{2,3}$/i.test(tokens[i])) {
        return tokens[i].toUpperCase();
      }
    }
    const match = exchange.match(/[A-Z]{2,3}/i);
    return match ? match[0].toUpperCase() : null;
  }

  if (multiplierType === "WPX_PREFIX") {
    return null;
  }

  return null;
}

export interface ContestEntryAreaProps {
  /** Optional class name for styling */
  className?: string;
}

/**
 * ContestEntryArea component
 * Wraps the entry form with QSO submission logic
 */
export function ContestEntryArea({ className }: ContestEntryAreaProps) {
  // Narrow selectors for minimal re-renders
  const activeSession = useContestStore((s) => s.activeSession);
  const logQSO = useContestStore((s) => s.logQSO);
  const incrementSerial = useContestStore((s) => s.incrementSerial);
  const addMultiplier = useContestStore((s) => s.addMultiplier);
  const isDupeCheck = useContestStore((s) => s.isDupe);

  const station = useUserStore((state) => state.station);

  // Dupe checking state
  const [currentCallsign, setCurrentCallsign] = useState("");
  const [currentBand, setCurrentBand] = useState("20m");
  const [currentMode, setCurrentMode] = useState("CW");

  // Get contest definition
  const contestDefinition = useMemo(() => {
    if (!activeSession) return null;
    return getContestById(activeSession.contestId);
  }, [activeSession]);

  // Check if current entry is a dupe
  const currentIsDupe = useMemo(() => {
    if (!currentCallsign || currentCallsign.length < 3) return false;
    return isDupeCheck(currentCallsign, currentBand, currentMode);
  }, [currentCallsign, currentBand, currentMode, isDupeCheck]);

  // Handle callsign change for dupe checking
  const handleCallsignChange = useCallback(
    (callsign: string, band: string, mode: string) => {
      setCurrentCallsign(callsign);
      setCurrentBand(band);
      setCurrentMode(mode);
    },
    [],
  );

  // Handle QSO submission
  const handleQSOSubmit = useCallback(
    (qsoData: Omit<ContestQSO, "id" | "timestamp">) => {
      if (!activeSession || !contestDefinition) return;

      // Check for dupe
      const dupeCheck = isDupeCheck(
        qsoData.callsign,
        qsoData.band,
        qsoData.mode,
      );
      if (dupeCheck) return;

      // Determine multiplier
      let isNewMultiplier = false;
      let multiplierValue: string | null = null;
      const multType = contestDefinition.multiplierType;

      if (multType === "WPX_PREFIX") {
        multiplierValue = extractCallsignPrefix(qsoData.callsign);
      } else {
        multiplierValue = extractMultiplierValue(
          qsoData.exchangeReceived,
          multType,
        );
      }

      // Add multiplier if found
      if (multiplierValue && multType !== "NONE") {
        const band = contestDefinition.multiplierPerBand
          ? qsoData.band
          : undefined;
        isNewMultiplier = addMultiplier(multType, multiplierValue, band);
      }

      // Calculate points based on contest scoring
      let points = 1;
      if (contestDefinition.scoring.mode === "fixed") {
        points = contestDefinition.scoring.fixedPoints || 1;
      } else if (contestDefinition.scoring.mode === "mixed") {
        const mode = qsoData.mode.toUpperCase();
        if (mode === "CW") {
          points = contestDefinition.scoring.cwPoints || 2;
        } else if (mode === "SSB") {
          points = contestDefinition.scoring.ssbPoints || 1;
        } else {
          points = contestDefinition.scoring.digitalPoints || 2;
        }
      } else if (contestDefinition.scoring.mode === "zone") {
        const workedEntity = getDXCCEntity(qsoData.callsign);
        const myEntity = station?.callsign
          ? getDXCCEntity(station.callsign)
          : null;

        if (workedEntity && myEntity) {
          if (workedEntity.entity === myEntity.entity) {
            points = contestDefinition.scoring.sameCountry || 0;
          } else if (workedEntity.continent === myEntity.continent) {
            points = contestDefinition.scoring.sameContinent || 1;
          } else {
            points = contestDefinition.scoring.diffContinent || 3;
          }
        } else {
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
      setCurrentCallsign("");
    },
    [
      activeSession,
      contestDefinition,
      isDupeCheck,
      addMultiplier,
      incrementSerial,
      logQSO,
      station,
    ],
  );

  return (
    <div className={className}>
      <ContestEntryForm
        session={activeSession}
        isDupe={currentIsDupe}
        onSubmit={handleQSOSubmit}
        onCallsignChange={handleCallsignChange}
      />
    </div>
  );
}

export default ContestEntryArea;
