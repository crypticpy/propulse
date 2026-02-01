/**
 * LocationInput Component
 *
 * Multi-mode location input supporting:
 * - Direct grid square entry
 * - Browser geolocation
 * - Manual GPS coordinates (lat/lon)
 * - Address lookup (geocoding)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { latLonToGrid, isValidGrid, gridToLatLon } from "@/lib/utils/grid";
import {
  geocodeAddress,
  parseCoordinateString,
  formatCoordinates,
  type GeocodingResult,
} from "@/lib/api/geocoding";

type InputMode = "grid" | "gps" | "geolocation" | "address";

interface LocationInputProps {
  /** Current grid value */
  value: string;
  /** Callback when grid changes */
  onChange: (grid: string) => void;
  /** Error message to display */
  error?: string | null;
  /** Callback to set error */
  onError: (error: string | null) => void;
}

interface LookupState {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
}

/**
 * Input mode button component
 */
function ModeButton({
  mode,
  activeMode,
  onClick,
  icon,
  label,
}: {
  mode: InputMode;
  activeMode: InputMode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const isActive = mode === activeMode;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors
        ${
          isActive
            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
            : "bg-nebula-blue text-gray-400 border border-white/10 hover:border-white/20 hover:text-gray-300"
        }
      `}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * LocationInput - Multi-mode location input
 */
export function LocationInput({
  value,
  onChange,
  error,
  onError,
}: LocationInputProps) {
  const [mode, setMode] = useState<InputMode>("grid");
  const [lookupState, setLookupState] = useState<LookupState>({
    status: "idle",
  });

  // Coordinate input state
  const [coordInput, setCoordInput] = useState("");

  // Address input state
  const [addressInput, setAddressInput] = useState("");
  const [addressResults, setAddressResults] = useState<GeocodingResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Debounce timer for address search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear results when mode changes
  useEffect(() => {
    setAddressResults([]);
    setShowResults(false);
    setLookupState({ status: "idle" });
    onError(null);
  }, [mode, onError]);

  // Handle grid square input
  const handleGridChange = useCallback(
    (inputValue: string) => {
      const upperValue = inputValue.toUpperCase();
      onChange(upperValue);

      if (upperValue.length === 0) {
        onError(null);
      } else if (upperValue.length >= 4 && !isValidGrid(upperValue)) {
        onError(
          "Invalid grid format. Use 4 or 6 characters (e.g., EM10 or EM10fp)",
        );
      } else {
        onError(null);
      }
    },
    [onChange, onError],
  );

  // Handle browser geolocation
  const handleGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      onError("Geolocation is not supported by your browser");
      return;
    }

    setLookupState({ status: "loading", message: "Getting your location..." });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const gridSquare = latLonToGrid(latitude, longitude);
        onChange(gridSquare);
        onError(null);
        setLookupState({
          status: "success",
          message: formatCoordinates(latitude, longitude),
        });
      },
      (geoError) => {
        let message = "Could not get your location";
        switch (geoError.code) {
          case GeolocationPositionError.PERMISSION_DENIED:
            message =
              "Location permission denied. Please enable location access in your browser settings.";
            break;
          case GeolocationPositionError.POSITION_UNAVAILABLE:
            message =
              "Location unavailable. Your device may not support geolocation.";
            break;
          case GeolocationPositionError.TIMEOUT:
            message = "Location request timed out. Please try again.";
            break;
        }
        onError(message);
        setLookupState({ status: "error", message });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, [onChange, onError]);

  // Handle coordinate input
  const handleCoordSubmit = useCallback(() => {
    const result = parseCoordinateString(coordInput);

    if ("error" in result) {
      onError(result.error);
      setLookupState({ status: "error", message: result.error });
      return;
    }

    const gridSquare = latLonToGrid(result.lat, result.lon);
    onChange(gridSquare);
    onError(null);
    setLookupState({
      status: "success",
      message: formatCoordinates(result.lat, result.lon),
    });
  }, [coordInput, onChange, onError]);

  // Handle address search with debounce
  const handleAddressChange = useCallback(
    (inputValue: string) => {
      setAddressInput(inputValue);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Clear results if input is too short
      if (inputValue.trim().length < 3) {
        setAddressResults([]);
        setShowResults(false);
        setLookupState({ status: "idle" });
        return;
      }

      // Debounce search
      setLookupState({ status: "loading", message: "Searching..." });
      searchTimeoutRef.current = setTimeout(async () => {
        const response = await geocodeAddress(inputValue);

        if ("error" in response) {
          setAddressResults([]);
          setShowResults(false);
          setLookupState({ status: "error", message: response.error.message });
          if (response.error.type !== "no_results") {
            onError(response.error.message);
          }
        } else {
          setAddressResults(response.results);
          setShowResults(true);
          setLookupState({
            status: "success",
            message: `${response.results.length} result${response.results.length === 1 ? "" : "s"} found`,
          });
          onError(null);
        }
      }, 500);
    },
    [onError],
  );

  // Handle address result selection
  const handleSelectAddress = useCallback(
    (result: GeocodingResult) => {
      const gridSquare = latLonToGrid(result.lat, result.lon);
      onChange(gridSquare);
      setAddressInput(result.displayName.split(",")[0]); // Show first part of address
      setShowResults(false);
      setLookupState({
        status: "success",
        message: formatCoordinates(result.lat, result.lon),
      });
      onError(null);
    },
    [onChange, onError],
  );

  // Get current coordinates for display
  const currentCoords =
    value && isValidGrid(value) ? gridToLatLon(value) : null;

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        <ModeButton
          mode="grid"
          activeMode={mode}
          onClick={() => setMode("grid")}
          icon={<GridIcon />}
          label="Grid"
        />
        <ModeButton
          mode="geolocation"
          activeMode={mode}
          onClick={() => {
            setMode("geolocation");
            handleGeolocation();
          }}
          icon={<LocationIcon />}
          label="My Location"
        />
        <ModeButton
          mode="gps"
          activeMode={mode}
          onClick={() => setMode("gps")}
          icon={<CoordIcon />}
          label="Coordinates"
        />
        <ModeButton
          mode="address"
          activeMode={mode}
          onClick={() => setMode("address")}
          icon={<SearchIcon />}
          label="Address"
        />
      </div>

      {/* Input area based on mode */}
      <div className="relative">
        {mode === "grid" && (
          <input
            type="text"
            value={value}
            onChange={(e) => handleGridChange(e.target.value)}
            placeholder="EM10fp"
            maxLength={6}
            className={`
              w-full px-3 py-2 bg-deep-space border rounded-lg
              text-white placeholder-gray-500 font-mono uppercase
              focus:outline-none
              ${
                error
                  ? "border-alert-red/50 focus:border-alert-red"
                  : "border-white/10 focus:border-plasma-orange/50"
              }
            `}
          />
        )}

        {mode === "geolocation" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => handleGridChange(e.target.value)}
              placeholder="Click 'Get Location' or enter grid"
              className={`
                flex-1 px-3 py-2 bg-deep-space border rounded-lg
                text-white placeholder-gray-500 font-mono uppercase
                focus:outline-none
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
              disabled={lookupState.status === "loading"}
              className="px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors text-sm font-medium
                         disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
            >
              {lookupState.status === "loading" ? (
                <SpinnerIcon />
              ) : (
                <LocationIcon />
              )}
              <span className="hidden sm:inline">Get Location</span>
            </button>
          </div>
        )}

        {mode === "gps" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={coordInput}
              onChange={(e) => setCoordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCoordSubmit();
                }
              }}
              placeholder="40.7128, -74.0060 or 40°42'N 74°0'W"
              className={`
                flex-1 px-3 py-2 bg-deep-space border rounded-lg
                text-white placeholder-gray-500 font-mono text-sm
                focus:outline-none
                ${
                  error
                    ? "border-alert-red/50 focus:border-alert-red"
                    : "border-white/10 focus:border-plasma-orange/50"
                }
              `}
            />
            <button
              type="button"
              onClick={handleCoordSubmit}
              className="px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors text-sm font-medium"
            >
              Convert
            </button>
          </div>
        )}

        {mode === "address" && (
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={addressInput}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="123 Main St, City, State or City, Country"
                  className={`
                    w-full px-3 py-2 bg-deep-space border rounded-lg
                    text-white placeholder-gray-500 text-sm
                    focus:outline-none
                    ${
                      error
                        ? "border-alert-red/50 focus:border-alert-red"
                        : "border-white/10 focus:border-plasma-orange/50"
                    }
                  `}
                />
                {lookupState.status === "loading" && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <SpinnerIcon />
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
          </div>
        )}
      </div>

      {/* Status/feedback area */}
      <div className="min-h-[1.25rem]">
        {error && <p className="text-xs text-alert-red">{error}</p>}

        {!error && lookupState.status === "success" && lookupState.message && (
          <p className="text-xs text-signal-green flex items-center gap-1">
            <CheckIcon />
            {lookupState.message}
          </p>
        )}

        {!error && value && isValidGrid(value) && currentCoords && (
          <p className="text-xs text-gray-500">
            Grid: <span className="font-mono text-gray-400">{value}</span>
            {" · "}
            {formatCoordinates(currentCoords.lat, currentCoords.lon)}
          </p>
        )}

        {mode === "gps" && !error && !value && (
          <p className="text-xs text-gray-500">
            Enter decimal (40.7, -74.0) or DMS (40°42'N 74°0'W) format
          </p>
        )}

        {mode === "address" &&
          !error &&
          !showResults &&
          addressInput.length < 3 && (
            <p className="text-xs text-gray-500">
              Type at least 3 characters to search
            </p>
          )}
      </div>
    </div>
  );
}

// Icon components
function GridIcon() {
  return (
    <svg
      className="w-4 h-4"
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

function LocationIcon() {
  return (
    <svg
      className="w-4 h-4"
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

function CoordIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="w-4 h-4"
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

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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

function CheckIcon() {
  return (
    <svg
      className="w-3 h-3"
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
