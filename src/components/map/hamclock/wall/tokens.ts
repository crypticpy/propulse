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

/**
 * Plain-language Kp descriptor. Shared by the Space weather tile and the
 * Solar report so the two never show different words for the same number.
 */
export function kpDescriptor(kp: number): string {
  if (kp < 2) return "QUIET";
  if (kp < 3) return "UNSETTLED";
  if (kp < 4) return "ACTIVE";
  if (kp < 5) return "MINOR UNREST";
  return `G${Math.min(5, Math.floor(kp) - 4)} STORM`;
}

export function kpTone(kp: number): { tone: string; state: string } {
  if (kp >= 5) return { tone: "hc-bad", state: "var(--hc-bad)" };
  if (kp >= 4) return { tone: "hc-warn", state: "var(--hc-warn)" };
  return { tone: "hc-good", state: "var(--hc-good)" };
}

/** A and B are background; C is workable; M and X mean daylight absorption. */
export function xrayTone(letter: string): { tone: string; state: string } {
  if (letter === "M" || letter === "X") {
    return { tone: "hc-bad", state: "var(--hc-bad)" };
  }
  if (letter === "C") return { tone: "hc-warn", state: "var(--hc-warn)" };
  return { tone: "hc-good", state: "var(--hc-good)" };
}

/** Fast wind stresses the magnetosphere; slow wind is the quiet baseline. */
export function windSpeedTone(speed: number): string {
  if (speed >= 600) return "hc-bad";
  if (speed >= 450) return "hc-warn";
  return "hc-good";
}

/** Southward (negative) Bz opens the door to geomagnetic storming. */
export function bzTone(bz: number): string {
  if (bz <= -10) return "hc-bad";
  if (bz < 0) return "hc-warn";
  return "hc-good";
}

/** Same buckets the RIM score card uses, so the tile and report agree. */
export function rimGrade(value: number): { word: string; tone: string } {
  if (value >= 90) return { word: "EXCELLENT", tone: "hc-good" };
  if (value >= 70) return { word: "GOOD", tone: "hc-good" };
  if (value >= 50) return { word: "FAIR", tone: "hc-warn" };
  if (value >= 30) return { word: "DEGRADED", tone: "hc-accent-text" };
  return { word: "POOR", tone: "hc-bad" };
}

/** Tone class → the matching wall state-bar colour. */
export const TONE_STATE: Record<string, string> = {
  "hc-good": "var(--hc-good)",
  "hc-warn": "var(--hc-warn)",
  "hc-bad": "var(--hc-bad)",
  "hc-accent-text": "var(--hc-accent)",
  "hc-info-text": "var(--hc-info)",
  "hc-dim-text": "var(--hc-dim2)",
};

/** Tone class → the report shell's tone name. */
export function reportTone(
  toneClass: string,
): "good" | "warn" | "bad" | "info" | "accent" {
  if (toneClass === "hc-good") return "good";
  if (toneClass === "hc-warn") return "warn";
  if (toneClass === "hc-bad") return "bad";
  if (toneClass === "hc-accent-text") return "accent";
  return "info";
}
