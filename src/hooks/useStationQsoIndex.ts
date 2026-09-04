/**
 * Shared QSO-count index for shack cards, rank, and completeness.
 * One IndexedDB scan, reused by every subscriber — never via useLogbook.
 */

import { useEffect, useState } from "react";
import {
  getAllLogEntries,
  subscribeLogEntries,
} from "@/lib/db/logStore";
import type { LogEntry } from "@/lib/db/types";

export interface StationQsoIndex {
  qsoCountById: Record<string, number>;
  stampedQsoCount: number;
  entries: Array<Pick<LogEntry, "radioId" | "antennaId" | "chainId">>;
  isLoading: boolean;
}

function emptyIndex(): StationQsoIndex {
  return { qsoCountById: {}, stampedQsoCount: 0, entries: [], isLoading: true };
}

function indexEntries(entries: LogEntry[]): Omit<StationQsoIndex, "isLoading"> {
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

let current: StationQsoIndex = emptyIndex();
const subscribers = new Set<(index: StationQsoIndex) => void>();
let started = false;

function emit(next: StationQsoIndex) {
  current = next;
  subscribers.forEach((listener) => listener(next));
}

function startSharedIndex() {
  if (started) return;
  started = true;
  const load = () => {
    void getAllLogEntries()
      .then((entries) => {
        emit({ ...indexEntries(entries), isLoading: false });
      })
      .catch(() => {
        emit({ ...emptyIndex(), isLoading: false });
      });
  };
  load();
  subscribeLogEntries(load);
}

export function useStationQsoIndex(): StationQsoIndex {
  const [index, setIndex] = useState<StationQsoIndex>(current);

  useEffect(() => {
    startSharedIndex();
    setIndex(current);
    subscribers.add(setIndex);
    return () => {
      subscribers.delete(setIndex);
    };
  }, []);

  return index;
}
