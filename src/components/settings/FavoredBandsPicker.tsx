/**
 * FavoredBandsPicker Component
 *
 * Allows users to select their favorite bands (shown prominently) and hidden bands (deprioritized).
 * Three states per band: normal (gray), favored (orange star), hidden (strikethrough/dimmed)
 * Click cycles through: normal -> favored -> hidden -> normal
 */

import { useUserStore } from "@/stores/userStore";
import { ALL_BANDS, DEFAULT_FAVORED_BANDS, type BandId } from "@/types/user";

interface FavoredBandsPickerProps {
  className?: string;
}

type BandState = "normal" | "favored" | "hidden";

/**
 * Get the current state of a band
 */
function getBandState(
  band: BandId,
  primary: BandId[],
  hidden: BandId[],
): BandState {
  if (primary.includes(band)) {
    return "favored";
  }
  if (hidden.includes(band)) {
    return "hidden";
  }
  return "normal";
}

/**
 * BandChip - Individual band chip with three-state toggle
 */
function BandChip({
  band,
  state,
  onClick,
}: {
  band: BandId;
  state: BandState;
  onClick: () => void;
}) {
  const baseClasses =
    "px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer select-none border";

  const stateClasses = {
    normal:
      "bg-nebula-blue text-gray-300 border-white/10 hover:border-white/20 hover:text-white",
    favored:
      "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/50 hover:bg-plasma-orange/30",
    hidden:
      "bg-white/5 text-gray-500 border-white/5 line-through opacity-60 hover:opacity-80",
  };

  const icon = {
    normal: null,
    favored: (
      <svg
        className="w-3.5 h-3.5 inline-block mr-1"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ),
    hidden: (
      <svg
        className="w-3.5 h-3.5 inline-block mr-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${stateClasses[state]}`}
      title={`${band}: ${state === "normal" ? "Click to favor" : state === "favored" ? "Click to hide" : "Click to reset"}`}
    >
      {icon[state]}
      {band}
    </button>
  );
}

/**
 * FavoredBandsPicker - Grid of band chips with three-state toggles
 */
export function FavoredBandsPicker({
  className = "",
}: FavoredBandsPickerProps) {
  const { preferences, setFavoredBands } = useUserStore();
  const favoredBands = preferences.favoredBands ?? DEFAULT_FAVORED_BANDS;
  const { primary, hidden } = favoredBands;

  /**
   * Cycle through states: normal -> favored -> hidden -> normal
   */
  const handleBandClick = (band: BandId) => {
    const currentState = getBandState(band, primary, hidden);

    let newPrimary = [...primary];
    let newHidden = [...hidden];

    switch (currentState) {
      case "normal":
        // Add to favored
        newPrimary = [...primary, band];
        break;
      case "favored":
        // Remove from favored, add to hidden
        newPrimary = primary.filter((b) => b !== band);
        newHidden = [...hidden, band];
        break;
      case "hidden":
        // Remove from hidden (back to normal)
        newHidden = hidden.filter((b) => b !== band);
        break;
    }

    setFavoredBands({ primary: newPrimary, hidden: newHidden });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Favored Bands
      </h3>

      {/* Legend / Instructions */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
        <p className="text-xs text-gray-400">
          Click to cycle: <span className="text-gray-300">Normal</span>
          {" -> "}
          <span className="text-plasma-orange">Favored</span>
          {" -> "}
          <span className="text-gray-500 line-through">Hidden</span>
          {" -> "}
          <span className="text-gray-300">Normal</span>
        </p>
      </div>

      {/* Band Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {ALL_BANDS.map((band) => (
          <BandChip
            key={band}
            band={band}
            state={getBandState(band, primary, hidden)}
            onClick={() => handleBandClick(band)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 pt-2 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-plasma-orange"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span>= Shown first</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span>= Hidden</span>
        </div>
      </div>

      {/* Summary */}
      {(primary.length > 0 || hidden.length > 0) && (
        <div className="text-xs text-gray-500">
          {primary.length > 0 && (
            <span>
              Favored:{" "}
              <span className="text-plasma-orange">{primary.join(", ")}</span>
            </span>
          )}
          {primary.length > 0 && hidden.length > 0 && (
            <span className="mx-2">|</span>
          )}
          {hidden.length > 0 && (
            <span>
              Hidden:{" "}
              <span className="text-gray-400 line-through">
                {hidden.join(", ")}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
