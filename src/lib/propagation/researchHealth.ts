export type ResearchHealthDisplayStatus = "healthy" | "degraded" | "error";

export interface ResearchHealthResponse {
  schemaVersion: 1;
  status: "healthy" | "degraded" | "alert";
  reportedAt: string;
  lastCompletedAt: string | null;
  freshnessSeconds: number | null;
  progress: {
    continuousHours: number;
    completedHours: number;
    requiredHours: number;
    missingHours: number;
  };
}

export interface ResearchHealthServiceState {
  status: ResearchHealthDisplayStatus;
  lastUpdated: number | undefined;
  errorMessage?: string;
}

const RESPONSE_KEYS = new Set([
  "schemaVersion",
  "status",
  "reportedAt",
  "lastCompletedAt",
  "freshnessSeconds",
  "progress",
]);
const PROGRESS_KEYS = new Set([
  "continuousHours",
  "completedHours",
  "requiredHours",
  "missingHours",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

export function parseResearchHealthResponse(
  value: unknown,
): ResearchHealthResponse | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const responseKeys = Object.keys(value);
  if (
    responseKeys.length !== RESPONSE_KEYS.size ||
    responseKeys.some((key) => !RESPONSE_KEYS.has(key))
  ) {
    return null;
  }
  if (
    value.status !== "healthy" &&
    value.status !== "degraded" &&
    value.status !== "alert"
  ) {
    return null;
  }
  if (typeof value.reportedAt !== "string") return null;
  const reportedAt = Date.parse(value.reportedAt);
  if (!Number.isFinite(reportedAt)) return null;
  if (
    value.lastCompletedAt !== null &&
    (typeof value.lastCompletedAt !== "string" ||
      !Number.isFinite(Date.parse(value.lastCompletedAt)))
  ) {
    return null;
  }
  if (
    value.freshnessSeconds !== null &&
    !isNonNegativeInteger(value.freshnessSeconds)
  ) {
    return null;
  }
  if (!isRecord(value.progress)) return null;
  const progress = value.progress;
  const progressKeys = Object.keys(progress);
  if (
    progressKeys.length !== PROGRESS_KEYS.size ||
    progressKeys.some((key) => !PROGRESS_KEYS.has(key))
  ) {
    return null;
  }
  if (
    !isNonNegativeInteger(progress.continuousHours) ||
    !isNonNegativeInteger(progress.completedHours) ||
    !isNonNegativeInteger(progress.requiredHours) ||
    !isNonNegativeInteger(progress.missingHours) ||
    progress.requiredHours < 720 ||
    progress.continuousHours > progress.completedHours
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    status: value.status,
    reportedAt: value.reportedAt,
    lastCompletedAt: value.lastCompletedAt,
    freshnessSeconds: value.freshnessSeconds,
    progress: {
      continuousHours: progress.continuousHours,
      completedHours: progress.completedHours,
      requiredHours: progress.requiredHours,
      missingHours: progress.missingHours,
    },
  };
}

export function evaluateResearchHealthResponse(
  value: unknown,
  staleThresholdMs: number,
  nowMs = Date.now(),
): ResearchHealthServiceState {
  const parsed = parseResearchHealthResponse(value);
  if (!parsed) {
    return {
      status: "error",
      lastUpdated: undefined,
      errorMessage: "Invalid health response",
    };
  }
  const lastUpdated = Date.parse(parsed.reportedAt);
  if (parsed.status === "alert") {
    return {
      status: "error",
      lastUpdated,
      errorMessage: "Research pipeline alert",
    };
  }
  if (parsed.status === "degraded" || nowMs - lastUpdated > staleThresholdMs) {
    return { status: "degraded", lastUpdated };
  }
  return { status: "healthy", lastUpdated };
}
