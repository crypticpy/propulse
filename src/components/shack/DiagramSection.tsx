/**
 * DiagramSection -- Wrapper for StationBuilderLab with auto-suggest CTA.
 *
 * When equipment exists but no signal paths (chains) are configured, shows a
 * CTA prompting the user to create their first signal path. Always renders
 * StationBuilderLab below.
 */

import { useShackStore } from "@/stores/shackStore";
import { StationBuilderLab } from "./builder/StationBuilderLab";

// ---- Props ------------------------------------------------------------------

interface DiagramSectionProps {
  /** Navigate to the Equipment tab */
  onNavigateToEquipment?: () => void;
}

// ---- Component --------------------------------------------------------------

export function DiagramSection({ onNavigateToEquipment }: DiagramSectionProps) {
  const radioCount = useShackStore((s) => s.radios.length);
  const antennaCount = useShackStore((s) => s.antennas.length);
  const feedlineCount = useShackStore((s) => s.feedlines.length);
  const chainCount = useShackStore((s) => s.stationChains.length);

  const hasEquipment = radioCount + antennaCount + feedlineCount > 0;

  return (
    <div className="space-y-4">
      {/* CTA: equipment exists but no signal paths */}
      {hasEquipment && chainCount === 0 && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-plasma-orange/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-plasma-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-300">
            You have equipment but no signal paths configured.
          </p>
          <p className="text-xs text-gray-500">
            A signal path maps your radio through cables and accessories to the
            antenna. Create one below to visualize your setup.
          </p>
        </div>
      )}

      {/* No equipment at all */}
      {!hasEquipment && chainCount === 0 && onNavigateToEquipment && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-gray-400">
            Add equipment first to start building signal paths.
          </p>
          <button
            type="button"
            onClick={onNavigateToEquipment}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-plasma-orange/15 text-plasma-orange text-sm font-medium hover:bg-plasma-orange/25 transition-colors min-h-[44px]"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Equipment
          </button>
        </div>
      )}

      {/* The actual builder */}
      <StationBuilderLab onNavigateToEquipment={onNavigateToEquipment} />
    </div>
  );
}
