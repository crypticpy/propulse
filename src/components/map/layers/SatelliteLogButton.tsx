/**
 * SatelliteLogButton — "Log This Pass" Button
 *
 * Renders a button in the satellite detail panel that prefills the QSO
 * form with satellite-specific data (satellite name, transponder mode,
 * downlink frequency, propagation mode) and navigates to the /log route.
 *
 * Only shown when the satellite is above the observer's horizon.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQSOStore } from "@/stores/qsoStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SatelliteLogButtonProps {
  /** Satellite name (e.g. "ISS (ZARYA)") */
  satelliteName: string;
  /** Transponder mode (e.g. "FM", "SSB") */
  transponderMode?: string;
  /** Downlink frequency in Hz */
  downlinkFrequencyHz?: number;
  /** Pass start time for QSO timestamp */
  passStartTime?: Date;
  /** Whether the satellite is currently above horizon */
  isAboveHorizon: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a transponder mode string to a standard amateur mode.
 */
function normalizeMode(mode?: string): string {
  if (!mode) return "FM";
  const upper = mode.toUpperCase();
  if (upper.includes("FM")) return "FM";
  if (upper.includes("SSB") || upper.includes("LINEAR")) return "SSB";
  if (upper.includes("CW")) return "CW";
  if (upper.includes("DIGI") || upper.includes("APRS")) return "DIGI";
  return mode;
}

/**
 * Convert Hz to kHz for the QSO form frequency field.
 */
function hzToKhz(hz: number): number {
  return Math.round(hz / 1000);
}

/**
 * Map downlink frequency in Hz to a band string.
 */
function frequencyToBand(hz?: number): string {
  if (!hz) return "2m";
  const mhz = hz / 1_000_000;
  if (mhz >= 420 && mhz <= 450) return "70cm";
  if (mhz >= 144 && mhz <= 148) return "2m";
  if (mhz >= 50 && mhz <= 54) return "6m";
  if (mhz >= 28 && mhz <= 29.7) return "10m";
  if (mhz >= 1240 && mhz <= 1300) return "23cm";
  if (mhz >= 2300 && mhz <= 2450) return "13cm";
  return "2m";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SatelliteLogButton({
  satelliteName,
  transponderMode,
  downlinkFrequencyHz,
  passStartTime,
  isAboveHorizon,
}: SatelliteLogButtonProps) {
  const navigate = useNavigate();
  const setField = useQSOStore((s) => s.setField);

  const handleClick = useCallback(() => {
    // Prefill the QSO form with satellite data
    const passInfo = passStartTime
      ? ` @ ${passStartTime.toISOString().slice(11, 16)}Z`
      : "";
    setField("notes", `SAT: ${satelliteName}${passInfo}`);
    setField("mode", normalizeMode(transponderMode));

    if (downlinkFrequencyHz) {
      setField("frequency", hzToKhz(downlinkFrequencyHz));
      setField("band", frequencyToBand(downlinkFrequencyHz));
    }

    // Navigate to the log page
    navigate("/log");
  }, [
    navigate,
    setField,
    satelliteName,
    transponderMode,
    downlinkFrequencyHz,
    passStartTime,
  ]);

  // Only render when satellite is above horizon
  if (!isAboveHorizon) return null;

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition-colors text-xs font-medium"
      title={`Log a QSO via ${satelliteName}`}
    >
      {/* Pencil/log icon */}
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
      Log This Pass
    </button>
  );
}

export default SatelliteLogButton;
