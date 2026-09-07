export type SpotWindowMinutes = 15 | 30 | 60;
export type SpotFeedSource = "pskreporter" | "rbn" | "dxcluster";
export interface SpotFeedMetadata {
  source: SpotFeedSource;
  status: "ok" | "stale" | "unknown";
  observedAt: number | null;
  fetchedAt: number | null;
  staleAfterSeconds: number | null;
  windowMinutes: SpotWindowMinutes | null;
}
export interface SpotFeed<T> {
  spots: T[];
  metadata: SpotFeedMetadata;
}

export function spotFeedWindowParameter(windowMinutes?: SpotWindowMinutes): string {
  if (windowMinutes === undefined) return "";
  if (![15, 30, 60].includes(windowMinutes)) throw new Error("Unsupported spot history window");
  return `&windowMinutes=${windowMinutes}`;
}

/** Missing legacy metadata is unknown; it cannot prove a requested history window. */
export function readSpotFeedMetadata(
  payload: unknown,
  source: SpotFeedSource,
  requestedWindow?: SpotWindowMinutes,
): SpotFeedMetadata {
  const unknown: SpotFeedMetadata = {
    source, status: "unknown", observedAt: null, fetchedAt: null,
    staleAfterSeconds: null, windowMinutes: null,
  };
  const meta = payload && typeof payload === "object" && "meta" in payload
    ? (payload as { meta: unknown }).meta : undefined;
  if (meta && typeof meta === "object" && "status" in meta && meta.status === "unavailable") {
    throw new Error(`${source} feed is unavailable`);
  }
  if (!meta || typeof meta !== "object" || !("schemaVersion" in meta)) {
    if (requestedWindow !== undefined) throw new Error(`${source} does not confirm the requested history window`);
    return unknown;
  }
  const value = meta as Record<string, unknown>;
  const timestamp = (input: unknown): number | null =>
    typeof input === "string" && /^\d{4}-\d{2}-\d{2}T/.test(input) && Number.isFinite(Date.parse(input))
      ? Date.parse(input) : null;
  const observedAt = value.observedAt === null ? null : timestamp(value.observedAt);
  const fetchedAt = timestamp(value.fetchedAt);
  const windowMinutes = value.windowMinutes === undefined ? null : value.windowMinutes;
  if (
    value.schemaVersion !== 1 || value.source !== source ||
    !["ok", "stale"].includes(String(value.status)) || fetchedAt === null ||
    (value.observedAt !== null && observedAt === null) ||
    (observedAt !== null && observedAt > fetchedAt) ||
    !Number.isInteger(value.staleAfterSeconds) || Number(value.staleAfterSeconds) <= 0 ||
    (windowMinutes !== null && ![15, 30, 60].includes(Number(windowMinutes))) ||
    (windowMinutes !== null && typeof windowMinutes !== "number")
  ) throw new Error(`${source} returned invalid feed metadata`);
  if (requestedWindow !== undefined && windowMinutes !== requestedWindow) {
    throw new Error(`${source} does not confirm the requested history window`);
  }
  return {
    source, status: value.status as "ok" | "stale", observedAt, fetchedAt,
    staleAfterSeconds: Number(value.staleAfterSeconds),
    windowMinutes: windowMinutes as SpotWindowMinutes | null,
  };
}
