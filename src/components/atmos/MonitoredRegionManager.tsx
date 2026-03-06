/**
 * MonitoredRegionManager — Manage monitored geographic regions for RIM scoring
 * Users can add regions by name (geocoded) and remove them. Max 5 regions.
 */

import { useState, useCallback } from "react";
import { useAtmosStore } from "@/stores/atmosStore";
import type { MonitoredRegion } from "@/types/atmos";

const MAX_REGIONS = 5;

export function MonitoredRegionManager() {
  const regions = useAtmosStore((s) => s.monitoredRegions);
  const addRegion = useAtmosStore((s) => s.addMonitoredRegion);
  const removeRegion = useAtmosStore((s) => s.removeMonitoredRegion);
  const [inputValue, setInputValue] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!inputValue.trim() || regions.length >= MAX_REGIONS) return;
    setIsGeocoding(true);

    try {
      // Use Open-Meteo geocoding (free, no API key)
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputValue.trim())}&count=1&language=en&format=json`,
      );

      if (!res.ok) throw new Error("Geocoding failed");
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        // Could not find location
        setIsGeocoding(false);
        return;
      }

      const result = data.results[0];
      const region: MonitoredRegion = {
        id: `region-${Date.now()}`,
        name: result.name + (result.admin1 ? `, ${result.admin1}` : ""),
        lat: result.latitude,
        lon: result.longitude,
        radiusKm: 150, // Default monitoring radius
      };

      addRegion(region);
      setInputValue("");
    } catch {
      // Silent fail
    } finally {
      setIsGeocoding(false);
    }
  }, [inputValue, regions.length, addRegion]);

  return (
    <div className="space-y-2">
      {/* Existing regions */}
      {regions.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs"
        >
          <span className="text-gray-300 truncate">{r.name}</span>
          <button
            onClick={() => removeRegion(r.id)}
            className="ml-1 text-gray-600 hover:text-alert-red text-[10px] shrink-0"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Add region input */}
      {regions.length < MAX_REGIONS && (
        <div className="flex gap-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="City or grid..."
            className="flex-1 px-2 py-1 rounded bg-void-black/60 border border-white/10 text-xs text-gray-300 placeholder:text-gray-600 outline-none focus:border-nebula-blue/50"
            disabled={isGeocoding}
          />
          <button
            onClick={handleAdd}
            disabled={isGeocoding || !inputValue.trim()}
            className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
          >
            {isGeocoding ? "..." : "+"}
          </button>
        </div>
      )}

      {regions.length === 0 && (
        <p className="text-[10px] text-gray-700 text-center py-1">
          Add cities to monitor RIM scores
        </p>
      )}
    </div>
  );
}
