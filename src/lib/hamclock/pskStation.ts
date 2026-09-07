/** A bounded, callsign-specific PSK Reporter snapshot, independent of the sampled global feed. */
export interface PskStationReport {
  senderCallsign: string;
  receiverCallsign: string;
  senderLocator: string | null;
  receiverLocator: string | null;
  frequencyHz: number;
  mode: string;
  snr: number | null;
  observedAt: number;
}

export interface PskStationSnapshot {
  callsign: string;
  reports: PskStationReport[];
  status: "ok" | "stale" | "unavailable";
  /** Last successful retrieval; an empty successful response still advances this. */
  fetchedAt: number | null;
  checkedAt: number;
  retryAt: number;
  windowMinutes: 1440;
  limit: number;
  /** At the retained-row ceiling; upstream completeness is never guaranteed. */
  limited: boolean;
  discarded: number;
}

export function canonicalPskCallsign(value: string): string | null {
  const call = value.trim().toUpperCase();
  return call.length <= 32 && /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(call)
    ? call
    : null;
}

export const PSK_WINDOWS = [15, 30, 60, 360, 1440] as const;
export type PskWindowMinutes = typeof PSK_WINDOWS[number];
export type PskDirection = "of" | "by";

/** OF = this station transmitted; BY = this station reported receiving. */
export function selectPskStationReports(
  snapshot: PskStationSnapshot | undefined,
  direction: PskDirection,
  minutes: PskWindowMinutes,
  now: number,
): PskStationReport[] {
  if (!snapshot) return [];
  return snapshot.reports.filter(report =>
    (direction === "of" ? report.senderCallsign : report.receiverCallsign) === snapshot.callsign &&
    report.observedAt >= now - minutes * 60_000 && report.observedAt <= now + 5_000,
  ).sort((a, b) => b.observedAt - a.observedAt);
}

export function pskStationState(snapshot: PskStationSnapshot | undefined, now: number): string {
  if (!snapshot || snapshot.status === "unavailable") return "UNAVAILABLE";
  return snapshot.status === "stale" || now >= snapshot.retryAt ? "STALE" : "UPDATED";
}
