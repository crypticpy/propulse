/**
 * QSOEntryForm - Form for logging QSO entries
 * Supports guest mode with visual distinction
 */

import { useState, useCallback, useEffect } from "react";
import type { GuestContext } from "@/hooks/useLogbook";
import type { LogEntry } from "@/lib/db/types";
import { Card } from "@/components/ui";
import { CallsignLookup } from "./CallsignLookup";

/** Available amateur radio bands */
const BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
];

/** Common operating modes */
const MODES = [
  "SSB",
  "CW",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "JS8",
  "AM",
  "FM",
  "SSTV",
  "OLIVIA",
  "MFSK",
];

export interface QSOEntryFormProps {
  /** Callback when a QSO is submitted */
  onSubmit: (
    entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  /** Guest context if in guest mode */
  guestContext?: GuestContext | null;
  /** Station callsign (host) for display in guest mode */
  stationCallsign?: string;
  /** Whether form submission is in progress */
  isSubmitting?: boolean;
}

/**
 * Get current UTC date in YYYY-MM-DD format
 */
function getCurrentUTCDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Get current UTC time in HH:MM format
 */
function getCurrentUTCTime(): string {
  const now = new Date();
  return now.toISOString().split("T")[1].substring(0, 5);
}

export function QSOEntryForm({
  onSubmit,
  guestContext,
  stationCallsign,
  isSubmitting = false,
}: QSOEntryFormProps) {
  const [callsign, setCallsign] = useState("");
  const [date, setDate] = useState(getCurrentUTCDate);
  const [timeOn, setTimeOn] = useState(getCurrentUTCTime);
  const [frequency, setFrequency] = useState("");
  const [band, setBand] = useState("20m");
  const [mode, setMode] = useState("FT8");
  const [rstSent, setRstSent] = useState("");
  const [rstRcvd, setRstRcvd] = useState("");
  const [grid, setGrid] = useState("");
  const [name, setName] = useState("");
  const [qth, setQth] = useState("");
  const [notes, setNotes] = useState("");

  const isGuestMode = !!guestContext;

  // Handle auto-fill from callsign lookup
  const handleAutoFill = useCallback(
    (data: { name?: string; grid?: string; qth?: string }) => {
      if (data.name && !name) setName(data.name);
      if (data.grid && !grid) setGrid(data.grid.toUpperCase());
      if (data.qth && !qth) setQth(data.qth);
    },
    [name, grid, qth],
  );

  // Update time periodically when form is visible
  useEffect(() => {
    const interval = setInterval(() => {
      // Only update if user hasn't modified the time
      setTimeOn((prev) => {
        const currentTime = getCurrentUTCTime();
        // If it's been modified significantly from auto-update, don't update
        return prev === getCurrentUTCTime() ||
          prev ===
            new Date(Date.now() - 60000)
              .toISOString()
              .split("T")[1]
              .substring(0, 5)
          ? currentTime
          : prev;
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!callsign.trim()) {
        return;
      }

      const entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt"> = {
        callsign: callsign.toUpperCase().trim(),
        date,
        timeOn,
        frequency: frequency ? parseFloat(frequency) : 0,
        band,
        mode,
        rstSent: rstSent || undefined,
        rstRcvd: rstRcvd || undefined,
        grid: grid || undefined,
        name: name || undefined,
        qth: qth || undefined,
        notes: notes || undefined,
      };

      await onSubmit(entry);

      // Reset form but keep band and mode
      setCallsign("");
      setDate(getCurrentUTCDate());
      setTimeOn(getCurrentUTCTime());
      setFrequency("");
      setRstSent("");
      setRstRcvd("");
      setGrid("");
      setName("");
      setQth("");
      setNotes("");
    },
    [
      callsign,
      date,
      timeOn,
      frequency,
      band,
      mode,
      rstSent,
      rstRcvd,
      grid,
      name,
      qth,
      notes,
      onSubmit,
    ],
  );

  const inputClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 disabled:opacity-50";

  const selectClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30";

  const labelClass = "block text-sm font-medium text-gray-400 mb-1";

  return (
    <Card
      className={`p-6 ${isGuestMode ? "border-cosmic-cyan/50 shadow-[0_0_20px_rgba(0,255,255,0.15)]" : ""}`}
    >
      {/* Guest Mode Banner */}
      {isGuestMode && guestContext && (
        <div className="mb-6 p-4 bg-cosmic-cyan/10 border border-cosmic-cyan/30 rounded-lg">
          <div className="flex items-center gap-2 text-cosmic-cyan">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="font-medium">Guest Logging Mode</span>
          </div>
          <p className="mt-2 text-sm text-gray-300">
            Logging as{" "}
            <span className="font-mono font-bold text-cosmic-cyan">
              {guestContext.operatorCallsign}
            </span>
            {stationCallsign && (
              <>
                {" "}
                @{" "}
                <span className="font-mono font-bold text-plasma-orange">
                  {stationCallsign}
                </span>
                's Station
              </>
            )}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Primary Fields - Callsign, Date, Time */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="callsign" className={labelClass}>
              Callsign *
            </label>
            <input
              type="text"
              id="callsign"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.toUpperCase())}
              placeholder="W1ABC"
              required
              disabled={isSubmitting}
              className={`${inputClass} font-mono text-lg`}
            />
            {/* Callsign Lookup - shows external data and local QSO history */}
            <CallsignLookup callsign={callsign} onAutoFill={handleAutoFill} />
          </div>
          <div>
            <label htmlFor="date" className={labelClass}>
              Date (UTC)
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="timeOn" className={labelClass}>
              Time (UTC)
            </label>
            <input
              type="time"
              id="timeOn"
              value={timeOn}
              onChange={(e) => setTimeOn(e.target.value)}
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
        </div>

        {/* Frequency, Band, Mode */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="frequency" className={labelClass}>
              Frequency (kHz)
            </label>
            <input
              type="number"
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="14074"
              step="0.001"
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="band" className={labelClass}>
              Band
            </label>
            <select
              id="band"
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
          <div>
            <label htmlFor="mode" className={labelClass}>
              Mode
            </label>
            <select
              id="mode"
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

        {/* RST Sent/Received */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rstSent" className={labelClass}>
              RST Sent
            </label>
            <input
              type="text"
              id="rstSent"
              value={rstSent}
              onChange={(e) => setRstSent(e.target.value)}
              placeholder="599"
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="rstRcvd" className={labelClass}>
              RST Received
            </label>
            <input
              type="text"
              id="rstRcvd"
              value={rstRcvd}
              onChange={(e) => setRstRcvd(e.target.value)}
              placeholder="599"
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
        </div>

        {/* Grid, Name, QTH */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="grid" className={labelClass}>
              Grid Locator
            </label>
            <input
              type="text"
              id="grid"
              value={grid}
              onChange={(e) => setGrid(e.target.value.toUpperCase())}
              placeholder="FN31pr"
              maxLength={8}
              disabled={isSubmitting}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John"
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="qth" className={labelClass}>
              QTH
            </label>
            <input
              type="text"
              id="qth"
              value={qth}
              onChange={(e) => setQth(e.target.value)}
              placeholder="New York, NY"
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes about this QSO..."
            rows={2}
            disabled={isSubmitting}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !callsign.trim()}
            className={`
              px-6 py-3 font-semibold rounded-lg transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                isGuestMode
                  ? "bg-cosmic-cyan text-deep-space hover:bg-cosmic-cyan/90 shadow-[0_0_15px_rgba(0,255,255,0.3)]"
                  : "bg-plasma-orange text-deep-space hover:bg-plasma-orange/90 shadow-[0_0_15px_rgba(255,170,0,0.3)]"
              }
            `}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 animate-spin"
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
                Logging...
              </span>
            ) : (
              <>{isGuestMode ? "Log as Guest" : "Log QSO"}</>
            )}
          </button>
        </div>
      </form>
    </Card>
  );
}

export default QSOEntryForm;
