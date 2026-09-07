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
