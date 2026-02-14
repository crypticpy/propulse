/**
 * SatMatchPanel
 *
 * Shared satellite pass scheduling panel. Allows operators to find passes
 * that are simultaneously visible from their location and a target station,
 * enabling coordinated satellite contacts.
 *
 * Uses findSharedPasses() from satMatch.ts for the heavy lifting.
 *
 * Mount this inside the SatellitePanel detail view when a satellite is selected.
 */

import { useState, useCallback, useMemo } from "react";
import {
  findSharedPasses,
  formatSharedPassSummary,
} from "@/lib/utils/satMatch";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import type { SharedPass } from "@/lib/utils/satMatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SatMatchPanelProps {
  /** Currently selected satellite TLE data */
  satellite: { name: string; tle1: string; tle2: string } | null;
  /** Observer's location (from station/profile) */
  myLocation: { lat: number; lon: number } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a UTC ISO timestamp to HH:MM display.
 */
function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * Format a UTC ISO timestamp to a short date + time display.
 */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = d.getUTCDate();
  const time = iso.slice(11, 16);
  return `${month} ${day} ${time}z`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SatMatchPanel({ satellite, myLocation }: SatMatchPanelProps) {
  const [gridInput, setGridInput] = useState("");
  const [results, setResults] = useState<SharedPass[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Derive target location from grid input
  const targetLocation = useMemo(() => {
    const trimmed = gridInput.trim();
    if (!trimmed || !isValidGrid(trimmed)) return null;
    try {
      return gridToLatLon(trimmed);
    } catch {
      return null;
    }
  }, [gridInput]);

  const canSearch =
    satellite !== null && myLocation !== null && targetLocation !== null;

  const handleSearch = useCallback(() => {
    if (!satellite || !myLocation || !targetLocation) return;

    setLoading(true);
    setError(null);
    setResults(null);

    // Run in a microtask to avoid blocking the UI
    // (SGP4 pass prediction is CPU-intensive)
    setTimeout(() => {
      try {
        const passes = findSharedPasses(
          satellite.tle1,
          satellite.tle2,
          satellite.name,
          myLocation,
          targetLocation,
          24, // Look ahead 24 hours
        );
        setResults(passes);
        if (passes.length === 0) {
          setError("No shared passes found in the next 24 hours.");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to compute passes.",
        );
      } finally {
        setLoading(false);
      }
    }, 0);
  }, [satellite, myLocation, targetLocation]);

  const handleCopy = useCallback(async (pass: SharedPass, index: number) => {
    const text = formatSharedPassSummary(pass);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback: select and copy
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }, []);

  // Early return: no satellite selected
  if (!satellite) {
    return (
      <div className="p-3 text-xs text-gray-500 text-center">
        Select a satellite to find shared passes.
      </div>
    );
  }

  // Early return: no observer location
  if (!myLocation) {
    return (
      <div className="p-3 text-xs text-gray-500 text-center">
        Set your QTH location to find shared passes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Header */}
      <div className="text-xs font-semibold text-nebula-blue tracking-wide uppercase">
        SatMatch - Shared Pass Finder
      </div>

      {/* Satellite name */}
      <div className="text-[11px] text-gray-400">
        Satellite:{" "}
        <span className="text-gray-200 font-medium">{satellite.name}</span>
      </div>

      {/* Grid input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Target grid (e.g. FN31pr)"
          value={gridInput}
          onChange={(e) => {
            setGridInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSearch) handleSearch();
          }}
          className="flex-1 bg-void-black/60 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-nebula-blue/60 font-mono"
          maxLength={8}
          aria-label="Target station grid locator"
        />
        <button
          onClick={handleSearch}
          disabled={!canSearch || loading}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-nebula-blue/20 text-nebula-blue border border-nebula-blue/30 hover:bg-nebula-blue/30 active:bg-nebula-blue/40"
        >
          {loading ? "Searching..." : "Find Passes"}
        </button>
      </div>

      {/* Validation hint */}
      {gridInput.trim() && !targetLocation && (
        <div className="text-[10px] text-caution-amber">
          Enter a valid Maidenhead grid (4-8 characters).
        </div>
      )}

      {/* Error message */}
      {error && !loading && (
        <div className="text-[10px] text-gray-500 text-center py-2">
          {error}
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
          {results.map((pass, i) => (
            <div
              key={`${pass.overlapStartUTC}-${i}`}
              className="bg-void-black/50 border border-gray-800 rounded p-2 flex flex-col gap-1"
            >
              {/* Pass time window */}
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-200 font-mono">
                  {formatDateTime(pass.overlapStartUTC)} -{" "}
                  {formatTime(pass.overlapEndUTC)}z
                </div>
                <button
                  onClick={() => handleCopy(pass, i)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                  aria-label="Copy pass summary"
                >
                  {copiedIndex === i ? "Copied" : "Copy"}
                </button>
              </div>

              {/* Pass details */}
              <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span>
                  Duration:{" "}
                  <span className="text-signal-green font-medium">
                    {pass.overlapDurationMin} min
                  </span>
                </span>
                <span>
                  My max el:{" "}
                  <span className="text-gray-300">
                    {Math.round(pass.myMaxEl)}&deg;
                  </span>
                </span>
                <span>
                  Their max el:{" "}
                  <span className="text-gray-300">
                    {Math.round(pass.theirMaxEl)}&deg;
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!results && !error && !loading && (
        <div className="text-[10px] text-gray-600 text-center py-3">
          Enter a target station grid to find shared satellite passes.
        </div>
      )}
    </div>
  );
}

export default SatMatchPanel;
