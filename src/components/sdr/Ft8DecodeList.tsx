/**
 * Ft8DecodeList — Scrollable list of enriched FT8/FT4 decodes.
 *
 * Each row shows time, SNR, frequency offset, country flag, callsign,
 * grid, distance, and the full message text. Rows are color-coded by
 * decode type (CQ, needed, dupe, calling-me).
 */

import { useRef, useEffect, useState } from "react";
import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";
import { formatUtcMsSinceMidnight } from "@/components/sdr/skins/types";

interface Ft8DecodeListProps {
  decodes: Ft8EnrichedDecode[];
  showFlags: boolean;
  showDistance: boolean;
  highlightNeeded: boolean;
  highlightCQ: boolean;
  myCallsign: string | null;
  onCallsignClick?: (callsign: string) => void;
  onCallsignDoubleClick?: (callsign: string) => void;
  maxHeight?: number;
}

/** Country code to flag emoji */
function countryFlag(code: string | undefined): string {
  if (!code || code.length !== 2) return "";
  const a = 0x1f1e6;
  return (
    String.fromCodePoint(a + code.charCodeAt(0) - 65) +
    String.fromCodePoint(a + code.charCodeAt(1) - 65)
  );
}

export function Ft8DecodeList({
  decodes,
  showFlags,
  showDistance,
  highlightNeeded,
  highlightCQ,
  myCallsign: _myCallsign,
  onCallsignClick,
  onCallsignDoubleClick,
  maxHeight = 320,
}: Ft8DecodeListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to top when new decodes arrive
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [decodes.length, autoScroll]);

  const handleScroll = () => {
    if (!listRef.current) return;
    // If user scrolled down, pause auto-scroll
    setAutoScroll(listRef.current.scrollTop < 10);
  };

  if (decodes.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-white/30">
        Waiting for decodes...
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
      style={{ maxHeight }}
    >
      <table className="w-full text-[10px] leading-tight">
        <thead className="sticky top-0 bg-void-black/90 text-white/30">
          <tr>
            <th className="px-1 py-1 text-left font-medium">UTC</th>
            <th className="px-1 py-1 text-right font-medium">dB</th>
            <th className="px-1 py-1 text-right font-medium">Freq</th>
            {showFlags && <th className="px-0.5 py-1 font-medium"></th>}
            <th className="px-1 py-1 text-left font-medium">Call</th>
            <th className="px-1 py-1 text-left font-medium">Grid</th>
            {showDistance && (
              <th className="px-1 py-1 text-right font-medium">km</th>
            )}
            <th className="px-1 py-1 text-left font-medium">Message</th>
          </tr>
        </thead>
        <tbody>
          {decodes.map((d, i) => {
            const rowBg = getRowBackground(d, highlightNeeded, highlightCQ);
            const textClass = d.isDupe
              ? "text-white/25 line-through"
              : "text-white/70";
            const callClass = getCallClass(d, highlightNeeded, highlightCQ);

            return (
              <tr
                key={`${d.time}-${d.deltaFrequency}-${i}`}
                className={`border-b border-white/[0.03] ${rowBg} hover:bg-white/[0.05]`}
              >
                <td
                  className={`whitespace-nowrap px-1 py-0.5 font-mono tabular-nums ${textClass}`}
                >
                  {formatUtcMsSinceMidnight(d.time)}
                </td>
                <td
                  className={`whitespace-nowrap px-1 py-0.5 text-right font-mono tabular-nums ${getSnrColor(d.snr)}`}
                >
                  {d.snr > 0 ? `+${d.snr}` : d.snr}
                </td>
                <td
                  className={`whitespace-nowrap px-1 py-0.5 text-right font-mono tabular-nums ${textClass}`}
                >
                  {d.deltaFrequency}
                </td>
                {showFlags && (
                  <td className="px-0.5 py-0.5 text-center">
                    {countryFlag(d.countryCode)}
                  </td>
                )}
                <td
                  className={`whitespace-nowrap px-1 py-0.5 font-mono font-semibold ${callClass}`}
                >
                  {d.callsign ? (
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() =>
                        d.callsign && onCallsignClick?.(d.callsign)
                      }
                      onDoubleClick={() =>
                        d.callsign && onCallsignDoubleClick?.(d.callsign)
                      }
                    >
                      {d.callsign}
                    </span>
                  ) : (
                    "\u2014"
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-1 py-0.5 font-mono ${textClass}`}
                >
                  {d.grid ?? ""}
                </td>
                {showDistance && (
                  <td
                    className={`whitespace-nowrap px-1 py-0.5 text-right font-mono tabular-nums ${textClass}`}
                  >
                    {d.distanceKm != null ? d.distanceKm.toLocaleString() : ""}
                  </td>
                )}
                <td
                  className={`truncate px-1 py-0.5 ${textClass}`}
                  title={d.message}
                >
                  {d.message}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRowBackground(
  d: Ft8EnrichedDecode,
  highlightNeeded: boolean,
  highlightCQ: boolean,
): string {
  if (d.isCallingMe) return "bg-alert-red/10";
  if (highlightNeeded && d.isNeeded) return "bg-caution-amber/8";
  if (highlightCQ && d.isCQ) return "bg-signal-green/[0.04]";
  return "";
}

function getCallClass(
  d: Ft8EnrichedDecode,
  highlightNeeded: boolean,
  highlightCQ: boolean,
): string {
  if (d.isCallingMe) return "text-alert-red";
  if (highlightNeeded && d.isNeeded) return "text-caution-amber";
  if (highlightCQ && d.isCQ) return "text-signal-green";
  if (d.isDupe) return "text-white/25 line-through";
  return "text-cosmic-cyan";
}

function getSnrColor(snr: number): string {
  if (snr >= 0) return "text-signal-green";
  if (snr >= -10) return "text-white/70";
  if (snr >= -18) return "text-caution-amber/70";
  return "text-alert-red/60";
}
