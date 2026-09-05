import type { LadderState } from "@/lib/verdict/ladder";

/**
 * Wall vocabulary for the Band Health ladder. The desk layout uses the longer
 * `LADDER_LABEL` strings; a wall tile read from ten feet needs one short word.
 */
export const LADDER_WALL_LABEL: Record<LadderState, string> = {
  hot: "HOT",
  verified: "OPEN",
  stirring: "RISING",
  forecast: "MARGINAL",
  closed: "CLOSED",
};

/** Ladder state → wall text class (theme tokens, never Tailwind colours). */
export const LADDER_WALL_CLASS: Record<LadderState, string> = {
  hot: "hc-good",
  verified: "hc-good",
  stirring: "hc-warn",
  forecast: "hc-dim-text",
  closed: "hc-dim-text",
};

/** Ladder state → the tile's top state-bar colour. */
export const LADDER_WALL_STATE: Record<LadderState, string> = {
  hot: "var(--hc-good)",
  verified: "var(--hc-good)",
  stirring: "var(--hc-warn)",
  forecast: "var(--hc-dim2)",
  closed: "var(--hc-dim2)",
};

/**
 * "2h 14m", "44m" — the wall never shows a bare minute count, because a
 * three-digit number of minutes is not something a reader converts at ten feet.
 */
export function formatCountdown(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${whole % 60}m`;
}

/** Local wall-clock time, 24-hour, in an explicit zone when one is known. */
export function formatClock(value: Date | null, timeZone?: string): string {
  if (!value || Number.isNaN(value.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(value);
  } catch {
    return value.toISOString().slice(11, 16);
  }
}
