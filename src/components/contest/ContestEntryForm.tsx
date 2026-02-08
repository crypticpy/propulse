/**
 * ContestEntryForm - Quick entry form for contest QSOs
 * Minimal fields optimized for fast logging during contests
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Card } from "@/components/ui";
import { DupeIndicator } from "./DupeIndicator";
import type { ContestSession, ContestQSO } from "@/stores/contestStore";
import { getDefaultRST } from "@/types/contest";
import { useRigStore } from "@/stores/rigStore";
import { frequencyToBand } from "@/types/bridge";

export interface ContestEntryFormProps {
  /** Callback when a QSO is submitted */
  onSubmit: (qso: Omit<ContestQSO, "id" | "timestamp">) => void;
  /** Whether the current callsign is a duplicate */
  isDupe: boolean;
  /** Active contest session */
  session: ContestSession | null;
  /** Callback when callsign changes (for dupe checking) */
  onCallsignChange?: (callsign: string, band: string, mode: string) => void;
}

/** Available amateur radio bands for contests */
const BANDS = ["160m", "80m", "40m", "20m", "15m", "10m", "6m"];

/** Common contest modes */
const MODES = ["CW", "SSB", "RTTY", "FT8"];

function rigModeToContestMode(mode: string): string {
  const m = mode.toUpperCase();
  if (m.includes("CW")) return "CW";
  if (m.includes("FT8") || m.includes("FT4") || m.includes("DIG")) return "FT8";
  if (m.includes("RTTY")) return "RTTY";
  if (m.includes("USB") || m.includes("LSB") || m.includes("SSB")) return "SSB";
  if (m.includes("AM") || m.includes("FM")) return "SSB";
  return "SSB";
}

export function ContestEntryForm({
  onSubmit,
  isDupe,
  session,
  onCallsignChange,
}: ContestEntryFormProps) {
  const [callsign, setCallsign] = useState("");
  const [exchangeRcvd, setExchangeRcvd] = useState("");
  const [rstSent, setRstSent] = useState("599");
  const [rstRcvd, setRstRcvd] = useState("599");
  const [band, setBand] = useState("20m");
  const [mode, setMode] = useState("CW");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callsignInputRef = useRef<HTMLInputElement>(null);

  const rigConnected = useRigStore((s) => s.connected);
  const rigFrequency = useRigStore((s) => s.frequency);
  const rigMode = useRigStore((s) => s.mode);

  // Auto-fill band/mode from connected radio state (CAT/daemon bridge).
  useEffect(() => {
    if (!rigConnected) return;
    const nextBand = frequencyToBand(rigFrequency);
    if (nextBand !== "?" && BANDS.includes(nextBand)) setBand(nextBand);
    const nextMode = rigModeToContestMode(String(rigMode));
    if (MODES.includes(nextMode)) setMode(nextMode);
  }, [rigConnected, rigFrequency, rigMode]);

  // Update RST defaults when mode changes
  useEffect(() => {
    const defaultRst = getDefaultRST(mode);
    setRstSent(defaultRst);
    setRstRcvd(defaultRst);
  }, [mode]);

  // Notify parent of callsign changes for dupe checking
  useEffect(() => {
    if (onCallsignChange && callsign.length >= 3) {
      onCallsignChange(callsign, band, mode);
    }
  }, [callsign, band, mode, onCallsignChange]);

  // Focus callsign input on mount and after submit
  useEffect(() => {
    callsignInputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!callsign.trim() || !session) {
        return;
      }

      setIsSubmitting(true);

      try {
        const qso: Omit<ContestQSO, "id" | "timestamp"> = {
          callsign: callsign.toUpperCase().trim(),
          band,
          mode,
          rstSent,
          rstReceived: rstRcvd,
          exchangeSent: session.myExchange,
          exchangeReceived: exchangeRcvd.toUpperCase().trim(),
          serialSent: session.currentSerial,
          points: isDupe ? 0 : 1, // Will be recalculated by parent
          isMultiplier: false, // Will be determined by parent
        };

        onSubmit(qso);

        // Reset form for next QSO
        setCallsign("");
        setExchangeRcvd("");

        // Focus callsign input for next entry
        callsignInputRef.current?.focus();
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      callsign,
      band,
      mode,
      rstSent,
      rstRcvd,
      exchangeRcvd,
      session,
      isDupe,
      onSubmit,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Submit on Enter key
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit],
  );

  const inputClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 disabled:opacity-50";

  const selectClass =
    "w-full px-2 py-2 bg-deep-space border border-white/10 rounded-lg text-white focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 text-sm";

  const labelClass = "block text-xs font-medium text-gray-400 mb-1";

  if (!session) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <p>No active contest session.</p>
          <p className="text-sm mt-2">Start a contest to begin logging.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      {/* Header with serial number and dupe indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Sending:</span>
          <span className="font-mono text-plasma-orange font-bold">
            {rstSent} #{session.currentSerial}
          </span>
          <span className="font-mono text-white/80">{session.myExchange}</span>
        </div>
        <DupeIndicator isDupe={isDupe} />
      </div>

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <div className="grid grid-cols-12 gap-3">
          {/* Callsign - largest field */}
          <div className="col-span-4">
            <label htmlFor="contest-callsign" className={labelClass}>
              Callsign
            </label>
            <input
              ref={callsignInputRef}
              type="text"
              id="contest-callsign"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.toUpperCase())}
              placeholder="W1ABC"
              disabled={isSubmitting}
              autoComplete="off"
              className={`${inputClass} font-mono text-lg ${
                isDupe ? "border-alert-red/50 bg-alert-red/10" : ""
              }`}
            />
          </div>

          {/* Exchange Received */}
          <div className="col-span-3">
            <label htmlFor="contest-exchange" className={labelClass}>
              Exchange Rcvd
            </label>
            <input
              type="text"
              id="contest-exchange"
              value={exchangeRcvd}
              onChange={(e) => setExchangeRcvd(e.target.value.toUpperCase())}
              placeholder="599 05"
              disabled={isSubmitting}
              autoComplete="off"
              className={`${inputClass} font-mono`}
            />
          </div>

          {/* RST Received (optional) */}
          <div className="col-span-1">
            <label htmlFor="contest-rst" className={labelClass}>
              RST
            </label>
            <input
              type="text"
              id="contest-rst"
              value={rstRcvd}
              onChange={(e) => setRstRcvd(e.target.value)}
              placeholder="599"
              disabled={isSubmitting}
              className={`${inputClass} font-mono text-center text-sm`}
            />
          </div>

          {/* Band */}
          <div className="col-span-2">
            <label htmlFor="contest-band" className={labelClass}>
              Band
            </label>
            <select
              id="contest-band"
              value={band}
              onChange={(e) => setBand(e.target.value)}
              disabled={isSubmitting}
              className={selectClass}
            >
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div className="col-span-2">
            <label htmlFor="contest-mode" className={labelClass}>
              Mode
            </label>
            <select
              id="contest-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={isSubmitting}
              className={selectClass}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit button */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Press{" "}
            <kbd className="px-1 py-0.5 bg-white/10 rounded text-gray-400">
              Enter
            </kbd>{" "}
            to log QSO
          </p>
          <button
            type="submit"
            disabled={isSubmitting || !callsign.trim() || isDupe}
            className={`
              px-6 py-2 font-semibold rounded-lg transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                isDupe
                  ? "bg-alert-red/20 text-alert-red border border-alert-red/50"
                  : "bg-plasma-orange text-deep-space hover:bg-plasma-orange/90 shadow-[0_0_15px_rgba(255,170,0,0.3)]"
              }
            `}
          >
            {isSubmitting ? "Logging..." : isDupe ? "DUPE" : "Log QSO"}
          </button>
        </div>
      </form>
    </Card>
  );
}

export default ContestEntryForm;
