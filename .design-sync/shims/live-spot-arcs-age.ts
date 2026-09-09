// Design-sync-only build shim for `@/components/map/LiveSpotArcs`.
//
// SpotRow (src/components/dx/DXSpotList/SpotRow.tsx) imports two pure,
// side-effect-free formatting helpers from that file - getSpotAgeInfo and
// formatSpotAge - but the file itself is a react-three-fiber globe overlay:
// it also statically imports `@react-three/fiber` / `@react-three/drei`,
// which eagerly construct a `react-reconciler` instance at module load time.
// esbuild can't tree-shake that away (top-level side effects), so bundling
// the real file crashes the WHOLE design-sync IIFE on load with
// `[SCHEDULER_MISSING]` - not just SpotRow's own preview card, every
// component, because they all share one bundle.
//
// Wired in via cfg.tsconfig (.design-sync/tsconfig.ds-sync.json path
// override, resolved by lib/bundle.mjs's tsconfigPathsPlugin) so it's a
// config-level redirect, not a src/ edit. The two functions below are a
// verbatim port of the real implementations (src/components/map/LiveSpotArcs.tsx
// lines ~101-183 as of this writing) - pure Date-math formatters, nothing
// R3F-specific. If that file's age thresholds or format ever change, this
// shim goes stale; see NOTES.md "Re-sync risks".

export type SpotAgeCategory = "fresh" | "recent" | "aging" | "stale" | "old";

export interface SpotAgeInfo {
  ageMinutes: number;
  ageCategory: SpotAgeCategory;
  opacity: number;
  scale: number;
  saturation: number;
}

export function getSpotAgeInfo(
  spotTime: Date,
  currentTime: Date = new Date(),
): SpotAgeInfo {
  const ageMinutes = (currentTime.getTime() - spotTime.getTime()) / 60000;

  if (ageMinutes < 2) {
    return { ageMinutes, ageCategory: "fresh", opacity: 1.0, scale: 1.0, saturation: 1.0 };
  }
  if (ageMinutes < 5) {
    return { ageMinutes, ageCategory: "recent", opacity: 0.9, scale: 0.9, saturation: 0.95 };
  }
  if (ageMinutes < 10) {
    return { ageMinutes, ageCategory: "aging", opacity: 0.75, scale: 0.75, saturation: 0.7 };
  }
  if (ageMinutes < 15) {
    return { ageMinutes, ageCategory: "stale", opacity: 0.6, scale: 0.6, saturation: 0.5 };
  }
  return { ageMinutes, ageCategory: "old", opacity: 0.4, scale: 0.5, saturation: 0.3 };
}

export function formatSpotAge(
  spotTime: Date,
  currentTime: Date = new Date(),
): string {
  const ageMs = currentTime.getTime() - spotTime.getTime();
  const totalSeconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}m`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// getAgeBadgeColors: verbatim port of LiveSpotArcs.tsx lines ~213-252 (added 2026-09-08 for SpotDetailsModal / SpotCollectionPopover).
export function getAgeBadgeColors(ageCategory: SpotAgeCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (ageCategory) {
    case "fresh":
      return {
        bg: "bg-green-500/20",
        text: "text-green-400",
        border: "border-green-500/30",
      };
    case "recent":
      return {
        bg: "bg-cyan-500/20",
        text: "text-cyan-400",
        border: "border-cyan-500/30",
      };
    case "aging":
      return {
        bg: "bg-yellow-500/20",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
      };
    case "stale":
      return {
        bg: "bg-orange-500/20",
        text: "text-orange-400",
        border: "border-orange-500/30",
      };
    case "old":
      return {
        bg: "bg-su-line/20",
        text: "text-su-muted",
        border: "border-su-line/30",
      };
  }
}

// ==========================================================================
