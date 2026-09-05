/**
 * BandModePill — Compact pill for the mobile header center.
 *
 * Displays the active band and mode with a band-colored left accent.
 * Shows a small source indicator dot when CAT (green) or WSJT-X (cyan)
 * is active. Tapping opens the BandModeModal for full band/mode selection.
 *
 * Touch target meets 44x44 minimum via min-w/min-h with flex centering.
 */

import { lazy, Suspense, useState } from "react";
import { useOperatingStore } from "@/stores/operatingStore";
import { BAND_COLORS } from "@/lib/utils/spotColors";

// The full band/mode picker is only visible after a tap; loading it lazily
// keeps it out of the app entry bundle without changing mount semantics.
const BandModeModal = lazy(() =>
  import("./BandModeModal").then((m) => ({ default: m.BandModeModal })),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BandModePillProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Source dot color mapping
// ---------------------------------------------------------------------------

const SOURCE_DOT_COLOR: Record<string, string | null> = {
  cat: "bg-green-400",
  wsjtx: "bg-cyan-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BandModePill({ className }: BandModePillProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeBand = useOperatingStore((s) => s.activeBand);
  const activeMode = useOperatingStore((s) => s.activeMode);
  const activeSource = useOperatingStore((s) => s.activeSource);

  const bandColor = BAND_COLORS[activeBand] ?? BAND_COLORS.default;
  const dotClass = SOURCE_DOT_COLOR[activeSource] ?? null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`
          inline-flex items-center gap-1.5
          min-w-[44px] min-h-[44px]
          px-2.5 py-1 rounded-full
          bg-white/10 text-xs font-medium text-gray-200
          border-l-2 transition-colors hover:bg-white/15
          ${className ?? ""}
        `}
        style={{ borderLeftColor: bandColor }}
        aria-label={`Band: ${activeBand}, Mode: ${activeMode}. Tap to change.`}
      >
        {dotClass && (
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`}
          />
        )}
        <span className="font-bold">{activeBand}</span>
        <span className="text-gray-400">{activeMode}</span>
      </button>

      <Suspense fallback={null}>
        <BandModeModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </Suspense>
    </>
  );
}
