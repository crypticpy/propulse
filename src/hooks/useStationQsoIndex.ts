/**
 * Shared QSO-count index for shack cards, rank, and completeness.
 * Loads IndexedDB once and refreshes when the log mutates — never via useLogbook.
 */

import { useEffect, useMemo, useState } from "react";
import {
  getAllLogEntries,
  subscribeLogEntries,
} from "@/lib/db/logStore";
import type { LogEntry } from "@/lib/db/types";

export interface StationQsoIndex {
  qsoCountById: Record<string, number>;
  stampedQsoCount: number;
  entries: Array<Pick<LogEntry, "radioId" | "antennaId" | "chainId">>;
}

function emptyIndex(): StationQsoIndex {
  return { qsoCountById: {}, stampedQsoCount: 0, entries: [] };
}

function indexEntries(entries: LogEntry[]): StationQsoIndex {
  const qsoCountById: Record<string, number> = {};
  let stampedQsoCount = 0;
  const slim: StationQsoIndex["entries"] = [];
  for (const entry of entries) {
    slim.push({
      radioId: entry.radioId,
      antennaId: entry.antennaId,
      chainId: entry.chainId,
    });
    const stamped = entry.radioId || entry.antennaId || entry.chainId;
    if (!stamped) continue;
    stampedQsoCount += 1;
    if (entry.radioId) {
      qsoCountById[entry.radioId] = (qsoCountById[entry.radioId] ?? 0) + 1;
    }
    if (entry.antennaId) {
      qsoCountById[entry.antennaId] = (qsoCountById[entry.antennaId] ?? 0) + 1;
    }
    if (entry.chainId) {
      qsoCountById[entry.chainId] = (qsoCountById[entry.chainId] ?? 0) + 1;
    }
  }
  return { qsoCountById, stampedQsoCount, entries: slim };
}

export function useStationQsoIndex(): StationQsoIndex {
  const [index, setIndex] = useState<StationQsoIndex>(emptyIndex);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getAllLogEntries()
        .then((entries) => {
          if (!cancelled) setIndex(indexEntries(entries));
        })
        .catch(() => {
          if (!cancelled) setIndex(emptyIndex());
        });
    };
    load();
    const unsubscribe = subscribeLogEntries(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return useMemo(() => index, [index]);
}
