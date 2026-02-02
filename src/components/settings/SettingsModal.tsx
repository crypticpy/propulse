import { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { DetailModal } from "@/components/ui/DetailModal";
import { useUserStore } from "@/stores/userStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { RadioManager } from "./RadioManager";
import { LocationInput } from "./LocationInput";
import type { UserStation, TextScale } from "@/types/user";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * SettingsModal - User settings for station location and preferences
 */
export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { station, setStation, preferences, updatePreferences } =
    useUserStore();

  // Local form state
  const [callsign, setCallsign] = useState(station?.callsign || "");
  const [grid, setGrid] = useState(station?.grid || "");
  const [gridError, setGridError] = useState<string | null>(null);
  const [timeFormat, setTimeFormat] = useState(preferences.timeFormat);
  const [units, setUnits] = useState(preferences.units);
  const [textScale, setTextScale] = useState<TextScale>(
    preferences.textScale ?? "md",
  );
  const [showFullRadioManager, setShowFullRadioManager] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCallsign(station?.callsign || "");
      setGrid(station?.grid || "");
      setTimeFormat(preferences.timeFormat);
      setUnits(preferences.units);
      setTextScale(preferences.textScale ?? "md");
      setGridError(null);
    }
  }, [isOpen, station, preferences]);

  // Handle save
  const handleSave = () => {
    // Validate grid if provided
    if (grid && !isValidGrid(grid)) {
      setGridError("Please enter a valid Maidenhead grid square");
      return;
    }

    // Build station object with multi-location support
    if (callsign || grid) {
      const coords = grid ? gridToLatLon(grid) : { lat: 0, lon: 0 };
      const gridUpper = grid.toUpperCase();

      // Check if we have an existing station with valid home location
      const existingStation = station;
      const existingHomeId = existingStation?.homeLocationId;
      const hasValidExistingHome =
        existingStation &&
        existingHomeId &&
        existingStation.savedLocations?.some(
          (loc) => loc.id === existingHomeId,
        );

      let newStation: UserStation;

      if (hasValidExistingHome && existingStation && existingHomeId) {
        // Update existing home location
        const updatedLocations = existingStation.savedLocations.map((loc) =>
          loc.id === existingHomeId
            ? { ...loc, grid: gridUpper, lat: coords.lat, lon: coords.lon }
            : loc,
        );
        newStation = {
          ...existingStation,
          callsign: callsign.toUpperCase(),
          savedLocations: updatedLocations,
          // Update legacy fields
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
        };
      } else {
        // Create new station with home location
        const homeLocationId = crypto.randomUUID();
        const homeLocation = {
          id: homeLocationId,
          name: "Home",
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
          type: "home" as const,
          createdAt: new Date().toISOString(),
        };
        newStation = {
          callsign: callsign.toUpperCase(),
          homeLocationId,
          activeLocationId: null,
          savedLocations: [homeLocation],
          // Legacy compatibility fields
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
        };
      }
      setStation(newStation);
    } else {
      setStation(null);
    }

    // Update preferences
    updatePreferences({ timeFormat, units, textScale });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-md p-6 flex flex-col max-h-[calc(100dvh-2rem)]"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
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
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 -mx-6 px-6">
          {/* Station Section */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Station Info
            </h3>

            {/* Callsign */}
            <div>
              <label
                htmlFor="callsign"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Callsign
              </label>
              <input
                type="text"
                id="callsign"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                placeholder="N5XXX"
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white placeholder-gray-500 font-mono
                         focus:outline-none focus:border-plasma-orange/50"
              />
            </div>

            {/* Location / Grid Square */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Station Location
              </label>
              <LocationInput
                value={grid}
                onChange={setGrid}
                error={gridError}
                onError={setGridError}
              />
            </div>
          </div>

          {/* Radio Equipment Section */}
          <div className="mb-6">
            <RadioManager compact />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullRadioManager(true)}
                className="px-3 py-1.5 text-xs bg-white/5 border border-white/10
                           text-gray-200 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              >
                Open full radio manager
              </button>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Preferences
            </h3>

            {/* Time Format */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Time Format
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTimeFormat("24h")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    timeFormat === "24h"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  24-hour
                </button>
                <button
                  onClick={() => setTimeFormat("12h")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    timeFormat === "12h"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  12-hour
                </button>
              </div>
            </div>

            {/* Units */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Distance Units
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setUnits("metric")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    units === "metric"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  Metric (km)
                </button>
                <button
                  onClick={() => setUnits("imperial")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    units === "imperial"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  Imperial (mi)
                </button>
              </div>
            </div>

            {/* Text Size - Accessibility */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Text Size
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  (Accessibility)
                </span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTextScale("sm")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    textScale === "sm"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  <span className="text-xs">Small</span>
                </button>
                <button
                  onClick={() => setTextScale("md")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    textScale === "md"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  Normal
                </button>
                <button
                  onClick={() => setTextScale("lg")}
                  className={`
                  flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    textScale === "lg"
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
                >
                  <span className="text-base">Large</span>
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Increase text size for better readability. Affects panels and
                data displays.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-shrink-0 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                       text-gray-300 hover:text-white hover:border-white/20
                       transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                       text-plasma-orange hover:bg-plasma-orange/30
                       transition-colors font-medium"
          >
            Save
          </button>
        </div>
      </Card>

      <DetailModal
        isOpen={showFullRadioManager}
        onClose={() => setShowFullRadioManager(false)}
        title="Radio Manager"
        subtitle="Add radios, track firmware/wiring, and manage multiple instances."
        size="full"
        zIndexClassName="z-[500]"
      >
        <RadioManager modalZIndexClassName="z-[550]" />
      </DetailModal>
    </div>
  );
}
