import { useMemo } from "react";
import { getContestById } from "@/lib/data/contests";
import {
  extractMultipliers,
  isNewMultiplier,
  parseOneLineEntry,
  type ContestQSODraft,
} from "@/lib/contest";
import type { ContestSession, MultiplierEntry } from "@/stores/contestStore";

export interface QsoBadge {
  label: "DUPE" | "NEW";
  classes: string;
}

function buildWorkedMultsMap(
  multipliers: MultiplierEntry[],
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

export function useQsoBadge({
  activeSession,
  draft,
  band,
  mode,
  isDupeCheck,
}: {
  activeSession: ContestSession | null;
  draft: string;
  band: string;
  mode: string;
  isDupeCheck: (callsign: string, band: string, mode: string) => boolean;
}): QsoBadge | null {
  return useMemo(() => {
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
        rst: mode === "SSB" ? "59" : "599",
        mode,
        band,
      },
    });

    if (!parsed.callsign || parsed.callsign.length < 2) {
      return null;
    }

    if (isDupeCheck(parsed.callsign, band, mode)) {
      return {
        label: "DUPE",
        classes: "bg-alert-red/15 text-alert-red border-alert-red/40",
      };
    }

    const workedMults = buildWorkedMultsMap(activeSession.multipliers);
    const draftQso: ContestQSODraft = {
      callsign: parsed.callsign,
      frequency: 0,
      band,
      mode,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toISOString().slice(11, 16).replace(":", ""),
      rstSent: mode === "SSB" ? "59" : "599",
      rstRcvd: parsed.rstReceived,
      exchangeSent: activeSession.myExchange,
      exchangeRcvd: parsed.exchangeReceived,
      parsedExchange: parsed.parsedFields,
    };

    const extracted = extractMultipliers(draftQso, contest);
    const hasNewMult = extracted.some((m) => isNewMultiplier(m, workedMults));
    if (!hasNewMult) {
      return null;
    }

    return {
      label: "NEW",
      classes: "bg-signal-green/15 text-signal-green border-signal-green/40",
    };
  }, [activeSession, band, draft, isDupeCheck, mode]);
}

export default useQsoBadge;

