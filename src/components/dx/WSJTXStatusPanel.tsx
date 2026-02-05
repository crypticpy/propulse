/**
 * WSJTXStatusPanel Component
 *
 * Compact status panel for WSJT-X integration.
 * Displays current WSJT-X status and recent decodes.
 * Designed to sit in the DX console area or as a collapsible panel.
 */

import { useState, useMemo, memo } from "react";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";
import { formatFrequency } from "@/types/bridge";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum decode rows to display */
const MAX_DISPLAY_DECODES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format milliseconds-since-midnight UTC to HH:MM:SS
 */
function formatTime(msSinceMidnight: number): string {
  const totalSeconds = Math.floor(msSinceMidnight / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Get SNR color class based on value
 * Green: > -10 dB, Yellow: -10 to -20 dB, Red: < -20 dB
 */
function snrColorClass(snr: number): string {
  if (snr > -10) return "text-signal-green";
  if (snr >= -20) return "text-solar-yellow";
  return "text-alert-red";
}

/**
 * Get SNR bar width as percentage (range: -30 to +10 dB mapped to 0..100%)
 */
function snrBarPercent(snr: number): number {
  // Map -30..+10 to 0..100
  const clamped = Math.max(-30, Math.min(10, snr));
  return ((clamped + 30) / 40) * 100;
}

/**
 * Get SNR bar background color
 */
function snrBarColor(snr: number): string {
  if (snr > -10) return "bg-signal-green/60";
  if (snr >= -20) return "bg-solar-yellow/60";
  return "bg-alert-red/60";
}

/**
 * Check if a decode message starts with "CQ "
 */
function isCQ(decode: WSJTXDecode): boolean {
  return decode.message.startsWith("CQ ");
}

// ─── Decode Row ──────────────────────────────────────────────────────────────

const DecodeRow = memo(function DecodeRow({ decode }: { decode: WSJTXDecode }) {
  const cq = isCQ(decode);

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs
        ${cq ? "bg-plasma-orange/5" : "hover:bg-white/5"}
        transition-colors`}
    >
      {/* Time */}
      <span className="text-gray-500 font-mono w-14 flex-shrink-0">
        {formatTime(decode.time)}
      </span>

      {/* SNR */}
      <div className="w-12 flex-shrink-0 flex items-center gap-1">
        <span
          className={`font-mono text-[10px] w-7 text-right ${snrColorClass(decode.snr)}`}
        >
          {decode.snr > 0 ? `+${decode.snr}` : decode.snr}
        </span>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${snrBarColor(decode.snr)}`}
            style={{ width: `${snrBarPercent(decode.snr)}%` }}
          />
        </div>
      </div>

      {/* Callsign */}
      <span
        className={`font-mono w-16 truncate flex-shrink-0 ${
          cq ? "text-plasma-orange font-bold" : "text-white/80"
        }`}
        title={decode.callsign || undefined}
      >
        {decode.callsign || "--"}
      </span>

      {/* Grid */}
      <span className="text-gray-500 font-mono w-10 flex-shrink-0">
        {decode.grid || ""}
      </span>

      {/* Message (truncated) */}
      <span className="text-gray-400 truncate min-w-0">{decode.message}</span>
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────

interface WSJTXStatusPanelProps {
  className?: string;
  /** Whether the panel starts collapsed */
  defaultCollapsed?: boolean;
}

export const WSJTXStatusPanel = memo(function WSJTXStatusPanel({
  className = "",
  defaultCollapsed = false,
}: WSJTXStatusPanelProps) {
  const { connected, status, decodes, decodeRate, uniqueCallsigns } =
    useWSJTXStore();

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [cqOnly, setCqOnly] = useState(false);

  // Filter decodes
  const displayDecodes = useMemo(() => {
    let filtered = decodes;
    if (cqOnly) {
      filtered = filtered.filter(isCQ);
    }
    return filtered.slice(0, MAX_DISPLAY_DECODES);
  }, [decodes, cqOnly]);

  // Connection indicator color
  const indicatorColor = connected ? "bg-signal-green" : "bg-gray-500";

  return (
    <div
      className={`bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${indicatorColor}`} />
          <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
            WSJT-X
          </span>
          {connected && status && (
            <span className="text-xs text-gray-500 font-mono">
              {formatFrequency(status.frequency)} / {status.mode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <span className="text-[10px] text-gray-500">{decodeRate}/min</span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
              collapsed ? "" : "rotate-180"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {!collapsed && (
        <div className="border-t border-white/10">
          {connected && status ? (
            <>
              {/* Status Bar */}
              <div className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] text-xs">
                {/* DX Call / Grid */}
                {status.dxCall && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">DX:</span>
                    <span className="text-white/80 font-mono font-medium">
                      {status.dxCall}
                    </span>
                    {status.dxGrid && (
                      <span className="text-gray-500 font-mono">
                        ({status.dxGrid})
                      </span>
                    )}
                  </div>
                )}

                {/* TX/RX Status */}
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                      ${
                        status.txEnabled
                          ? "bg-alert-red/20 text-alert-red"
                          : "bg-signal-green/20 text-signal-green"
                      }`}
                  >
                    {status.txEnabled ? "TX" : "RX"}
                  </span>
                </div>

                {/* Decode Rate */}
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Decodes:</span>
                  <span className="text-white/80 font-mono">
                    {decodeRate}/min
                  </span>
                </div>

                {/* Unique Callsigns */}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-gray-500">Unique:</span>
                  <span className="text-white/80 font-mono">
                    {uniqueCallsigns.size}
                  </span>
                </div>
              </div>

              {/* CQ Filter Toggle */}
              <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Recent Decodes
                </span>
                <button
                  type="button"
                  onClick={() => setCqOnly(!cqOnly)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
                    ${
                      cqOnly
                        ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                        : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                    }`}
                >
                  CQ Only
                </button>
              </div>

              {/* Decode List */}
              <div className="max-h-60 overflow-y-auto">
                {displayDecodes.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {displayDecodes.map((decode, i) => (
                      <DecodeRow
                        key={`${decode.time}-${decode.message}-${i}`}
                        decode={decode}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center text-xs text-gray-500">
                    {cqOnly ? "No CQ decodes yet" : "Waiting for decodes..."}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Not Connected State */
            <div className="px-3 py-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/5">
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400">WSJT-X not connected</p>
                <p className="text-xs text-gray-500 mt-1">
                  Start WSJT-X and the ProPulse Bridge to see decodes here. Make
                  sure UDP reporting is enabled in WSJT-X settings.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default WSJTXStatusPanel;
