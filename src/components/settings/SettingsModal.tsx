import { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { useUserStore } from "@/stores/userStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { RadioManager } from "./RadioManager";
import { LocationInput } from "./LocationInput";
import type { UserStation } from "@/types/user";

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

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCallsign(station?.callsign || "");
      setGrid(station?.grid || "");
      setTimeFormat(preferences.timeFormat);
      setUnits(preferences.units);
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

    // Build station object
    if (callsign || grid) {
      const coords = grid ? gridToLatLon(grid) : { lat: 0, lon: 0 };
      const newStation: UserStation = {
        callsign: callsign.toUpperCase(),
        grid: grid.toUpperCase(),
        lat: coords.lat,
        lon: coords.lon,
      };
      setStation(newStation);
    } else {
      setStation(null);
    }

    // Update preferences
    updatePreferences({ timeFormat, units });

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
    </div>
  );
}
