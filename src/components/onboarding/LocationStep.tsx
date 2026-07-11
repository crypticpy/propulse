/**
 * LocationStep Component
 * Second step of the onboarding wizard - grid square location entry
 */

import { useState, useCallback, useEffect } from "react";
import { latLonToGrid, isValidGrid, gridToLatLon } from "@/lib/utils/grid";
import {
  geocodeAddress,
  formatCoordinates,
  type GeocodingResult,
} from "@/lib/api/geocoding";

type InputMode = "grid" | "geolocation" | "address";

interface LocationStepProps {
  /** Current grid value */
  grid: string;
  /** Callback when grid changes */
  onGridChange: (grid: string) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back */
  onBack: () => void;
}

/**
 * Location step for entering grid square
 */
export function LocationStep({
  grid,
  onGridChange,
  onNext,
  onBack,
}: LocationStepProps) {
  const [mode, setMode] = useState<InputMode>("grid");
  const [localGrid, setLocalGrid] = useState(grid);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Address search state
  const [addressInput, setAddressInput] = useState("");
  const [addressResults, setAddressResults] = useState<GeocodingResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Update parent when local grid changes
  useEffect(() => {
    if (isValidGrid(localGrid)) {
      onGridChange(localGrid);
      setError(null);
    }
  }, [localGrid, onGridChange]);

  // Handle grid input
  const handleGridChange = useCallback((value: string) => {
    const upperValue = value.toUpperCase();
    setLocalGrid(upperValue);

    if (upperValue.length === 0) {
      setError(null);
    } else if (upperValue.length >= 4 && !isValidGrid(upperValue)) {
      setError("Invalid format. Use 4 or 6 characters (e.g., EM10 or EM10fp)");
    } else {
      setError(null);
    }
  }, []);

  // Handle browser geolocation
  const handleGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setLoading(true);
    setStatusMessage("Getting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const gridSquare = latLonToGrid(latitude, longitude);
        setLocalGrid(gridSquare);
        setError(null);
        setStatusMessage(formatCoordinates(latitude, longitude));
        setLoading(false);
      },
      (geoError) => {
        let message = "Could not get your location";
        switch (geoError.code) {
          case GeolocationPositionError.PERMISSION_DENIED:
            message =
              "Location permission denied. Please enable it in browser settings.";
            break;
          case GeolocationPositionError.POSITION_UNAVAILABLE:
            message = "Location unavailable.";
            break;
          case GeolocationPositionError.TIMEOUT:
            message = "Location request timed out.";
            break;
        }
        setError(message);
        setLoading(false);
        setStatusMessage(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, []);

  // Handle address search
  const handleAddressSearch = useCallback(async (value: string) => {
    setAddressInput(value);
    setShowResults(false);

    if (value.trim().length < 3) {
      setAddressResults([]);
      return;
    }

    setLoading(true);
    const response = await geocodeAddress(value);

    if ("error" in response) {
      if (response.error.type !== "no_results") {
        setError(response.error.message);
      }
      setAddressResults([]);
    } else {
      setAddressResults(response.results);
      setShowResults(true);
      setError(null);
    }
    setLoading(false);
  }, []);

  // Handle address result selection
  const handleSelectAddress = useCallback((result: GeocodingResult) => {
    const gridSquare = latLonToGrid(result.lat, result.lon);
    setLocalGrid(gridSquare);
    setAddressInput(result.displayName.split(",")[0]);
    setShowResults(false);
    setStatusMessage(formatCoordinates(result.lat, result.lon));
  }, []);

  // Get current coordinates for display
  const currentCoords =
    localGrid && isValidGrid(localGrid) ? gridToLatLon(localGrid) : null;

  const canProceed = localGrid.length >= 4 && isValidGrid(localGrid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 bg-cosmic-cyan/20 rounded-full mb-2">
          <LocationIcon className="w-8 h-8 text-cosmic-cyan" />
        </div>
        <h2 className="text-2xl font-bold text-white font-[Orbitron]">
          Set Your Location
        </h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Your grid square helps us calculate propagation paths and show
          relevant solar data for your location.
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex justify-center gap-2">
        <ModeButton
          active={mode === "grid"}
          onClick={() => setMode("grid")}
          icon={<GridIcon className="w-4 h-4" />}
          label="Grid Square"
        />
        <ModeButton
          active={mode === "geolocation"}
          onClick={() => {
            setMode("geolocation");
            handleGeolocation();
          }}
          icon={<LocationIcon className="w-4 h-4" />}
          label="My Location"
        />
        <ModeButton
          active={mode === "address"}
          onClick={() => setMode("address")}
          icon={<SearchIcon className="w-4 h-4" />}
          label="Address"
        />
      </div>

      {/* Input area */}
      <div className="max-w-md mx-auto space-y-4">
        {mode === "grid" && (
          <div className="space-y-2">
            <input
              type="text"
              value={localGrid}
              onChange={(e) => handleGridChange(e.target.value)}
              placeholder="EM10fp"
              maxLength={6}
              className={`
                w-full px-4 py-3 bg-deep-space border rounded-lg
                text-white text-center font-mono text-xl uppercase
                placeholder-gray-600 focus:outline-none transition-colors
                ${
                  error
                    ? "border-alert-red/50 focus:border-alert-red"
                    : "border-white/10 focus:border-plasma-orange/50"
                }
              `}
            />
            <p className="text-xs text-gray-500 text-center">
              Enter your Maidenhead grid locator (4 or 6 characters)
            </p>
          </div>
        )}

        {mode === "geolocation" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={localGrid}
                onChange={(e) => handleGridChange(e.target.value)}
                placeholder="Click button to detect"
                className={`
                  flex-1 px-4 py-3 bg-deep-space border rounded-lg
                  text-white text-center font-mono text-lg uppercase
                  placeholder-gray-600 focus:outline-none transition-colors
                  ${
                    error
                      ? "border-alert-red/50 focus:border-alert-red"
                      : "border-white/10 focus:border-plasma-orange/50"
                  }
                `}
              />
              <button
                type="button"
                onClick={handleGeolocation}
                disabled={loading}
                className="px-4 py-3 bg-cosmic-cyan/20 border border-cosmic-cyan/50 rounded-lg
                           text-cosmic-cyan hover:bg-cosmic-cyan/30
                           transition-colors font-medium
                           disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
              >
                {loading ? (
                  <SpinnerIcon className="w-5 h-5" />
                ) : (
                  <LocationIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        )}

        {mode === "address" && (
          <div className="relative space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={addressInput}
                  onChange={(e) => handleAddressSearch(e.target.value)}
                  placeholder="City, State or Address"
                  className={`
                    w-full px-4 py-3 bg-deep-space border rounded-lg
                    text-white placeholder-gray-600 focus:outline-none transition-colors
                    ${
                      error
                        ? "border-alert-red/50 focus:border-alert-red"
                        : "border-white/10 focus:border-plasma-orange/50"
                    }
                  `}
                />
                {loading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <SpinnerIcon className="w-5 h-5 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Address results dropdown */}
            {showResults && addressResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-deep-space border border-white/20 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {addressResults.map((result, index) => (
                  <button
                    key={`${result.lat}-${result.lon}-${index}`}
                    type="button"
                    onClick={() => handleSelectAddress(result)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white
                               border-b border-white/5 last:border-b-0 transition-colors"
                  >
                    <div className="truncate">{result.displayName}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatCoordinates(result.lat, result.lon)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Current grid display */}
            {localGrid && isValidGrid(localGrid) && (
              <div className="text-center py-2 px-4 bg-white/5 rounded-lg border border-white/10">
                <span className="text-sm text-gray-400">Grid: </span>
                <span className="font-mono text-white">{localGrid}</span>
              </div>
            )}
          </div>
        )}

        {/* Status/error display */}
        <div className="min-h-[1.5rem] text-center">
          {error && <p className="text-sm text-alert-red">{error}</p>}
          {!error && statusMessage && (
            <p className="text-sm text-signal-green flex items-center justify-center gap-1">
              <CheckIcon className="w-4 h-4" />
              {statusMessage}
            </p>
          )}
          {!error && !statusMessage && currentCoords && (
            <p className="text-sm text-gray-500">
              {formatCoordinates(currentCoords.lat, currentCoords.lon)}
            </p>
          )}
        </div>

        {/* Mini map preview */}
        {currentCoords && (
          <div className="relative h-32 bg-nebula-blue rounded-lg overflow-hidden border border-white/10">
            <div className="absolute inset-0 opacity-30">
              {/* Simple grid pattern background */}
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern
                    id="grid"
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                      className="text-white/20"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-4 h-4 bg-plasma-orange rounded-full animate-pulse mx-auto shadow-[0_0_15px_rgba(255,107,53,0.6)]" />
                <p className="mt-2 font-mono text-sm text-white/80">
                  {localGrid}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Why this matters */}
      <div className="max-w-md mx-auto p-4 bg-white/5 rounded-lg border border-white/10">
        <h4 className="text-sm font-medium text-gray-300 mb-2">
          Why we need your location:
        </h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>- Calculate accurate propagation paths and bearings</li>
          <li>- Show distance to DX stations</li>
          <li>- Display relevant solar data for your region</li>
          <li>- Determine ITU region for band plans</li>
        </ul>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between max-w-md mx-auto">
        <button
          onClick={onBack}
          className="px-6 py-2.5 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`
            px-8 py-2.5 rounded-lg font-semibold transition-all
            ${
              canProceed
                ? "bg-plasma-orange text-white hover:bg-plasma-orange/90 shadow-[0_0_15px_rgba(255,107,53,0.3)]"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }
          `}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * Mode selection button
 */
function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${
          active
            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
            : "bg-nebula-blue text-gray-400 border border-white/10 hover:border-white/20 hover:text-gray-300"
        }
      `}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Icon components
function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
