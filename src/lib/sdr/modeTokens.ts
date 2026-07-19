/**
 * modeTokens — Shared radio operating-mode token helpers.
 *
 * Device mode tokens vary by rig (e.g. "CWR" vs "CW-R", "RTTYR" vs
 * "RTTY-R"). These helpers compute a canonical *display* label and a
 * stable sort rank from a raw device token, without ever discarding the
 * original token — commands sent back to the daemon must use the exact
 * token the device advertised, not a normalized/rewritten one.
 */

/** Canonical display order for known modes. Unknown modes sort last. */
const MODE_DISPLAY_ORDER = [
  "LSB",
  "USB",
  "CW",
  "CW-R",
  "RTTY",
  "RTTY-R",
  "AM",
  "FM",
  "WFM",
  "FT8",
  "FT4",
] as const;

/** Fallback mode list used when a device advertises none. */
export const DEFAULT_MODE_TOKENS: readonly string[] = MODE_DISPLAY_ORDER;

/** Normalize a raw device mode token to a canonical display label. */
export function normalizeModeDisplay(mode: string): string {
  const m = mode.toUpperCase().trim().replace(/_/g, "-");
  if (m === "CWR" || m === "CW R") return "CW-R";
  if (m === "RTTYR" || m === "RTTY R") return "RTTY-R";
  return m;
}

/** Sort rank for a mode token, based on its normalized display form. */
export function modeSortRank(mode: string): number {
  const idx = MODE_DISPLAY_ORDER.indexOf(
    normalizeModeDisplay(mode) as (typeof MODE_DISPLAY_ORDER)[number],
  );
  return idx === -1 ? MODE_DISPLAY_ORDER.length : idx;
}

/** Comparator for sorting mode tokens by rank, then normalized label. */
export function compareModes(a: string, b: string): number {
  const rankDelta = modeSortRank(a) - modeSortRank(b);
  if (rankDelta !== 0) return rankDelta;
  return normalizeModeDisplay(a).localeCompare(normalizeModeDisplay(b));
}

export interface ModeToken {
  /**
   * Raw device token — the exact string the device advertised (first one
   * seen for this display form). Send this to onModeChange / the daemon.
   */
  raw: string;
  /** Canonical display label (e.g. "CW-R"). */
  display: string;
}

/**
 * Dedup raw device mode tokens by their normalized display form, keeping
 * the first raw token seen for each. Returns entries sorted by mode rank
 * (then display label).
 */
export function dedupeModeTokens(rawModes: string[]): ModeToken[] {
  const source = rawModes.length > 0 ? rawModes : [...DEFAULT_MODE_TOKENS];
  const seen = new Map<string, ModeToken>();

  for (const raw of source) {
    const display = normalizeModeDisplay(raw);
    if (!display || seen.has(display)) continue;
    seen.set(display, { raw, display });
  }

  return [...seen.values()].sort((a, b) => compareModes(a.display, b.display));
}
