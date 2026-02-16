/**
 * modeColors — Centralized mode-to-color mapping for SDR UI.
 *
 * Eliminates duplication across FlexVfoDisplay, SlicePanelFilter,
 * and other components that need mode-aware coloring.
 */

// ─── Mode groups ──────────────────────────────────────────────────────────────

export type ModeGroup = "ssb" | "cw" | "am" | "digital" | "unknown";

export const MODE_GROUPS: Record<ModeGroup, string[]> = {
  ssb: ["USB", "LSB", "SSB"],
  cw: ["CW", "CWR", "CW-R"],
  am: ["AM", "FM", "NFM", "WFM"],
  digital: [
    "RTTY",
    "RTTY-R",
    "DIGI",
    "FT8",
    "FT4",
    "JS8",
    "PSK",
    "DIGU",
    "DIGL",
  ],
  unknown: [],
};

/** Reverse lookup: upper-case mode string -> group. */
const MODE_TO_GROUP = new Map<string, ModeGroup>();
for (const [group, modes] of Object.entries(MODE_GROUPS) as [
  ModeGroup,
  string[],
][]) {
  for (const m of modes) {
    MODE_TO_GROUP.set(m, group);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Determine which mode group a mode string belongs to. */
export function getModeGroup(mode: string | null): ModeGroup {
  if (!mode) return "unknown";
  return MODE_TO_GROUP.get(mode.toUpperCase()) ?? "unknown";
}

/** Tailwind text color class for a mode (e.g. "text-signal-green"). */
export function getModeTextClass(mode: string | null): string {
  switch (getModeGroup(mode)) {
    case "ssb":
      return "text-signal-green";
    case "cw":
      return "text-cosmic-cyan";
    case "am":
      return "text-caution-amber";
    case "digital":
      return "text-purple-400";
    case "unknown":
      return "text-gray-400";
  }
}

/** Tailwind bg + border classes for mode pill / badge backgrounds. */
export function getModeBgClass(mode: string | null): string {
  switch (getModeGroup(mode)) {
    case "ssb":
      return "bg-signal-green/15 border-signal-green/30";
    case "cw":
      return "bg-cosmic-cyan/15 border-cosmic-cyan/30";
    case "am":
      return "bg-caution-amber/15 border-caution-amber/30";
    case "digital":
      return "bg-purple-400/15 border-purple-400/30";
    case "unknown":
      return "bg-gray-400/15 border-gray-400/30";
  }
}

/** CSS rgba color string for inline styles (accent bar, glow, etc.). */
export function getModeAccentCss(mode: string | null): string {
  switch (getModeGroup(mode)) {
    case "ssb":
      return "rgba(34, 197, 94, 0.9)";
    case "cw":
      return "rgba(0, 220, 255, 0.9)";
    case "am":
      return "rgba(245, 158, 11, 0.9)";
    case "digital":
      return "rgba(168, 85, 247, 0.9)";
    case "unknown":
      return "rgba(156, 163, 175, 0.5)";
  }
}
