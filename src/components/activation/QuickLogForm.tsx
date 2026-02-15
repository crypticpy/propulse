/**
 * QuickLogForm — Stripped-down QSO entry form for POTA/SOTA activations.
 *
 * Mobile-optimized with large touch targets and minimal fields.
 * - Callsign (primary, auto-uppercase)
 * - RST sent/received (auto-filled defaults)
 * - Notes (optional)
 * - Band/mode auto-filled from rig or last entry
 *
 * Enter-to-log, auto-focus callsign after log.
 * Shows last 3 logged callsigns as dismissible chips.
 * Success flash (green border pulse) on log.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { getRSTDefault } from "@/lib/utils/rstDefaults";

// ── Types ────────────────────────────────────────────────────────────────────

interface QuickLogFormProps {
  /** Called after a QSO is successfully logged */
  onLogged?: (callsign: string) => void;
  /** Optional class names */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function QuickLogForm({ onLogged, className = "" }: QuickLogFormProps) {
  const [callsign, setCallsign] = useState("");
  const [rstSent, setRstSent] = useState("");
  const [rstRcvd, setRstRcvd] = useState("");
  const [notes, setNotes] = useState("");
  const [recentCalls, setRecentCalls] = useState<string[]>([]);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const callsignRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const logQSO = useQSOStore((s) => s.logQSO);
  const setField = useQSOStore((s) => s.setField);
  const formMode = useQSOStore((s) => s.form.mode);
  const formBand = useQSOStore((s) => s.form.band);

  const rigConnected = useRigStore((s) => s.connected);
  const rigMode = useRigStore((s) => s.mode);
  const rigBand = useRigStore((s) => s.band);

  // Determine effective mode and RST defaults
  const effectiveMode =
    rigConnected && rigMode ? String(rigMode) : formMode || "SSB";
  const rstDefault = getRSTDefault(effectiveMode);

  // Auto-fill band/mode from rig on mount and rig changes
  useEffect(() => {
    if (rigConnected) {
      if (rigMode) setField("mode", String(rigMode));
      if (rigBand) setField("band", rigBand);
    }
  }, [rigConnected, rigMode, rigBand, setField]);

  // Auto-focus callsign on mount
  useEffect(() => {
    callsignRef.current?.focus();
  }, []);

  // ── Submit Handler ───────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      const trimmed = callsign.trim().toUpperCase();
      if (!trimmed || isLogging) return;

      setIsLogging(true);

      try {
        // Set form fields before logging
        setField("callsign", trimmed);
        setField("rstSent", rstSent || rstDefault);
        setField("rstRcvd", rstRcvd || rstDefault);
        if (notes) setField("notes", notes);

        const id = await logQSO();
        if (id) {
          // Update recent callsigns (max 3, no duplicates)
          setRecentCalls((prev) => {
            const filtered = prev.filter((c) => c !== trimmed);
            return [trimmed, ...filtered].slice(0, 3);
          });

          // Flash success
          setFlashSuccess(true);
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlashSuccess(false), 600);

          // Reset form for next entry
          setCallsign("");
          setRstSent("");
          setRstRcvd("");
          setNotes("");

          // Re-focus callsign
          requestAnimationFrame(() => {
            callsignRef.current?.focus();
          });

          onLogged?.(trimmed);
        }
      } catch (err) {
        console.error("[QuickLogForm] Log failed:", err);
      } finally {
        setIsLogging(false);
      }
    },
    [
      callsign,
      rstSent,
      rstRcvd,
      notes,
      rstDefault,
      isLogging,
      setField,
      logQSO,
      onLogged,
    ],
  );

  // ── Key handler for Enter-to-log ─────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Dismiss a recent callsign chip ───────────────────────────────────────

  const dismissRecent = (call: string) => {
    setRecentCalls((prev) => prev.filter((c) => c !== call));
  };

  const effectiveBand = rigConnected && rigBand ? rigBand : formBand;

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-3 ${className} ${
        flashSuccess
          ? "ring-2 ring-signal-green/60 rounded-lg transition-all duration-200"
          : ""
      }`}
    >
      {/* Band/Mode indicator */}
      {(effectiveBand || effectiveMode) && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          {effectiveBand && (
            <span className="px-2 py-0.5 rounded bg-white/5 font-mono">
              {effectiveBand}
            </span>
          )}
          {effectiveMode && (
            <span className="px-2 py-0.5 rounded bg-white/5 font-mono">
              {effectiveMode}
            </span>
          )}
          {rigConnected && (
            <span className="text-signal-green text-[10px]">CAT</span>
          )}
        </div>
      )}

      {/* Callsign — primary field, large touch target */}
      <div>
        <input
          ref={callsignRef}
          type="text"
          value={callsign}
          onChange={(e) => setCallsign(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="CALLSIGN"
          className="w-full h-14 px-4 rounded-lg bg-space-900 border border-white/10
                     text-white text-xl font-mono font-bold uppercase tracking-wider
                     placeholder-white/20
                     focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/50
                     transition-colors"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </div>

      {/* RST Sent / RST Received — side by side */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="quick-rst-sent"
            className="block text-[10px] text-white/40 uppercase tracking-wider mb-1"
          >
            RST Sent
          </label>
          <input
            id="quick-rst-sent"
            type="text"
            value={rstSent}
            onChange={(e) => setRstSent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={rstDefault}
            className="w-full h-11 px-3 rounded-lg bg-space-900 border border-white/10
                       text-white font-mono text-center
                       placeholder-white/20
                       focus:outline-none focus:ring-1 focus:ring-white/20
                       transition-colors"
            inputMode="numeric"
          />
        </div>
        <div>
          <label
            htmlFor="quick-rst-rcvd"
            className="block text-[10px] text-white/40 uppercase tracking-wider mb-1"
          >
            RST Rcvd
          </label>
          <input
            id="quick-rst-rcvd"
            type="text"
            value={rstRcvd}
            onChange={(e) => setRstRcvd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={rstDefault}
            className="w-full h-11 px-3 rounded-lg bg-space-900 border border-white/10
                       text-white font-mono text-center
                       placeholder-white/20
                       focus:outline-none focus:ring-1 focus:ring-white/20
                       transition-colors"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Notes — optional, compact */}
      <div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Notes (optional)"
          className="w-full h-10 px-3 rounded-lg bg-space-900 border border-white/10
                     text-white text-sm placeholder-white/20
                     focus:outline-none focus:ring-1 focus:ring-white/20
                     transition-colors"
        />
      </div>

      {/* Log button */}
      <button
        type="submit"
        disabled={!callsign.trim() || isLogging}
        className="w-full h-12 rounded-lg font-bold text-base uppercase tracking-wider
                   bg-plasma-orange text-void-black
                   hover:bg-plasma-orange/90 active:scale-[0.98]
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-all duration-150"
      >
        {isLogging ? "Logging..." : "Log QSO"}
      </button>

      {/* Recent callsigns chips */}
      {recentCalls.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-white/30 uppercase mr-1">
            Recent:
          </span>
          {recentCalls.map((call) => (
            <span
              key={call}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                         bg-white/5 text-white/60 text-xs font-mono"
            >
              {call}
              <button
                type="button"
                onClick={() => dismissRecent(call)}
                className="text-white/30 hover:text-white/60 transition-colors ml-0.5"
                aria-label={`Dismiss ${call}`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
