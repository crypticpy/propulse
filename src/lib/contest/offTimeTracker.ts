/**
 * Off-Time Tracker for Contest Operating Time Rules
 *
 * Many contests (especially single-operator categories) limit total operating
 * time within the contest period. For example, CQWW single-op allows 36 hours
 * of operating time in a 48-hour contest window. Off-time periods must be at
 * least 60 minutes.
 *
 * This module detects operating periods from QSO timestamps, calculates
 * remaining operating time, and warns operators when they need to take breaks.
 *
 * @module lib/contest/offTimeTracker
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A contiguous block of operating activity, detected from QSO timestamps.
 * A new period begins whenever a gap exceeds `minOffTimePeriodMinutes`.
 */
export interface OperatingPeriod {
  /** Timestamp (ms) of the first QSO in this period */
  start: number;
  /** Timestamp (ms) of the last QSO in this period */
  end: number;
  /** Number of QSOs logged during this period */
  qsoCount: number;
}

/**
 * Comprehensive off-time status for the current contest session.
 */
export interface OffTimeStatus {
  /** Total minutes spent operating (sum of operating periods) */
  totalOperatingMinutes: number;
  /** Total minutes of off-time between operating periods */
  totalOffTimeMinutes: number;
  /** Minimum required off-time minutes according to rules */
  requiredOffTimeMinutes: number;
  /** Minutes of operating time still available before limit is reached */
  remainingOperatingMinutes: number;
  /** Timestamp when the operator MUST stop and take a break (null if no restriction or plenty of time) */
  mustStopBy: Date | null;
  /** True if currently exceeding the maximum operating time */
  isViolation: boolean;
  /** Detected operating periods from QSO timestamps */
  periods: OperatingPeriod[];
  /** Minutes remaining until the contest ends */
  contestTimeRemainingMinutes: number;
  /** Percentage of allowed operating time used (0-100) */
  percentOperating: number;
}

/**
 * Off-time rules for a contest category.
 * Not all contests have off-time rules; if absent the tracker is inactive.
 */
export interface OffTimeRules {
  /** Maximum operating hours allowed within the contest window */
  maxOperatingHours: number;
  /** Total contest duration in hours */
  contestDurationHours: number;
  /** Minimum consecutive off-time minutes to count as a valid break (default 30) */
  minOffTimePeriodMinutes: number;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Detect operating periods from a list of QSO timestamps.
 *
 * Sorts timestamps, then groups them into contiguous periods where
 * gaps between consecutive QSOs are less than `minGapMinutes`.
 * A gap >= `minGapMinutes` starts a new operating period.
 *
 * @param qsoTimestamps - Array of QSO timestamps in milliseconds
 * @param minGapMinutes - Minimum gap (minutes) that separates operating periods (default 30)
 * @returns Array of detected operating periods
 */
export function detectOperatingPeriods(
  qsoTimestamps: number[],
  minGapMinutes: number = 30,
): OperatingPeriod[] {
  if (qsoTimestamps.length === 0) {
    return [];
  }

  // Sort ascending
  const sorted = [...qsoTimestamps].sort((a, b) => a - b);
  const minGapMs = minGapMinutes * 60 * 1000;

  const periods: OperatingPeriod[] = [];
  let periodStart = sorted[0];
  let periodEnd = sorted[0];
  let qsoCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];

    if (gap >= minGapMs) {
      // Close current period and start a new one
      periods.push({ start: periodStart, end: periodEnd, qsoCount });
      periodStart = sorted[i];
      periodEnd = sorted[i];
      qsoCount = 1;
    } else {
      // Extend current period
      periodEnd = sorted[i];
      qsoCount++;
    }
  }

  // Close the final period
  periods.push({ start: periodStart, end: periodEnd, qsoCount });

  return periods;
}

/**
 * Calculate the comprehensive off-time status for a contest session.
 *
 * @param qsoTimestamps - Array of QSO timestamps in milliseconds
 * @param contestStart  - Contest start timestamp in milliseconds
 * @param contestEnd    - Contest end timestamp in milliseconds
 * @param rules         - Off-time rules for this contest/category
 * @returns Full off-time status including warnings and violation state
 */
export function getOffTimeStatus(
  qsoTimestamps: number[],
  contestStart: number,
  contestEnd: number,
  rules: OffTimeRules,
): OffTimeStatus {
  const now = Date.now();
  const periods = detectOperatingPeriods(
    qsoTimestamps,
    rules.minOffTimePeriodMinutes,
  );

  // Sum operating time across all periods
  // For each period, operating time = end - start (minimum 1 minute for single-QSO periods)
  const ONE_MINUTE_MS = 60 * 1000;
  let totalOperatingMs = 0;
  for (const period of periods) {
    const periodDuration = period.end - period.start;
    // A single QSO still represents at least ~1 minute of operating
    totalOperatingMs += Math.max(periodDuration, ONE_MINUTE_MS);
  }

  // If currently in an operating period (last QSO within the gap window),
  // extend the current period to "now"
  if (periods.length > 0) {
    const lastPeriod = periods[periods.length - 1];
    const timeSinceLastQSO = now - lastPeriod.end;
    const minGapMs = rules.minOffTimePeriodMinutes * 60 * 1000;

    if (timeSinceLastQSO < minGapMs && now > lastPeriod.end) {
      // Still within the current operating period — extend it to now
      const extension = now - lastPeriod.end;
      totalOperatingMs += extension;
    }
  }

  const totalOperatingMinutes = totalOperatingMs / ONE_MINUTE_MS;
  const maxOperatingMinutes = rules.maxOperatingHours * 60;
  const remainingOperatingMinutes = Math.max(
    0,
    maxOperatingMinutes - totalOperatingMinutes,
  );

  // Contest time remaining
  const contestTimeRemainingMs = Math.max(0, contestEnd - now);
  const contestTimeRemainingMinutes = contestTimeRemainingMs / ONE_MINUTE_MS;

  // Total contest elapsed time
  const contestElapsedMs = Math.max(
    0,
    Math.min(now, contestEnd) - contestStart,
  );
  const totalOffTimeMs = Math.max(0, contestElapsedMs - totalOperatingMs);
  const totalOffTimeMinutes = totalOffTimeMs / ONE_MINUTE_MS;

  // Required off-time = contest duration - max operating (in minutes)
  const requiredOffTimeMinutes =
    rules.contestDurationHours * 60 - maxOperatingMinutes;

  // Violation check
  const isViolation = totalOperatingMinutes > maxOperatingMinutes;

  // Calculate mustStopBy: if remaining operating time + now < contestEnd,
  // we need a break at some point. mustStopBy = now + remainingOperatingMinutes
  let mustStopBy: Date | null = null;
  if (!isViolation && remainingOperatingMinutes > 0) {
    const stopTimestamp = now + remainingOperatingMinutes * ONE_MINUTE_MS;
    // Only show mustStopBy if it falls before the contest end
    if (stopTimestamp < contestEnd) {
      mustStopBy = new Date(stopTimestamp);
    }
  }

  // Percent of allowed operating time used
  const percentOperating =
    maxOperatingMinutes > 0
      ? Math.min(100, (totalOperatingMinutes / maxOperatingMinutes) * 100)
      : 0;

  return {
    totalOperatingMinutes,
    totalOffTimeMinutes,
    requiredOffTimeMinutes,
    remainingOperatingMinutes,
    mustStopBy,
    isViolation,
    periods,
    contestTimeRemainingMinutes,
    percentOperating,
  };
}

/**
 * Generate a human-readable warning string based on off-time status.
 *
 * @param status - Current off-time status
 * @returns Warning message string, or null if no warning needed
 *
 * Priority:
 *   1. Violation (red) — operating time exceeded
 *   2. Critical (< 30 min remaining)
 *   3. Warning (< 2 hours remaining)
 */
export function formatOffTimeWarning(status: OffTimeStatus): string | null {
  if (status.isViolation) {
    return "OFF-TIME VIOLATION \u2014 Stop operating! You have exceeded the maximum allowed operating time.";
  }

  if (status.remainingOperatingMinutes <= 0) {
    return "OFF-TIME VIOLATION \u2014 No operating time remaining!";
  }

  if (status.remainingOperatingMinutes < 30) {
    const mins = Math.round(status.remainingOperatingMinutes);
    return `CRITICAL: Only ${mins} minute${mins !== 1 ? "s" : ""} of operating time remaining. Take a break soon!`;
  }

  if (status.remainingOperatingMinutes < 120) {
    const hours = Math.floor(status.remainingOperatingMinutes / 60);
    const mins = Math.round(status.remainingOperatingMinutes % 60);
    const timeStr =
      hours > 0 ? `${hours}h ${mins.toString().padStart(2, "0")}m` : `${mins}m`;
    return `Take a break soon \u2014 ${timeStr} of operating time remaining.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

/**
 * Format minutes into a human-readable "Xh YYm" or "Ym" string.
 */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}`;
  }
  return `${mins}m`;
}
