/**
 * DxccStatusBadge — Color-coded DXCC working status badge.
 *
 * Shows next to the callsign input to instantly indicate whether the
 * entered callsign represents a new DXCC entity, new band, new mode,
 * already worked, or duplicate contact.
 *
 * Desktop: hover tooltip with entity details.
 * Mobile: inline detail text below the badge.
 */

import { useState, useRef, useEffect } from "react";
import type { DXCCStatusResult, DXCCStatus } from "@/hooks/useDxccStatus";

// ── Status Configuration ─────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  /** Tailwind bg class for the pill */
  bg: string;
  /** Tailwind text class for the pill */
  text: string;
  /** Tailwind border class for the pill */
  border: string;
  /** Pulse animation for high-priority statuses */
  pulse: boolean;
}

const STATUS_CONFIG: Record<DXCCStatus, StatusConfig> = {
  new_entity: {
    label: "New Entity!",
    bg: "bg-alert-red/15",
    text: "text-alert-red",
    border: "border-alert-red/30",
    pulse: true,
  },
  new_band: {
    label: "New Band",
    bg: "bg-signal-green/15",
    text: "text-signal-green",
    border: "border-signal-green/30",
    pulse: true,
  },
  new_mode: {
    label: "New Mode",
    bg: "bg-nebula-blue/15",
    text: "text-nebula-blue",
    border: "border-nebula-blue/30",
    pulse: false,
  },
  worked: {
    label: "Worked",
    bg: "bg-plasma-orange/15",
    text: "text-plasma-orange",
    border: "border-plasma-orange/30",
    pulse: false,
  },
  dupe: {
    label: "Dupe",
    bg: "bg-white/5",
    text: "text-gray-500",
    border: "border-white/10",
    pulse: false,
  },
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface DxccStatusBadgeProps {
  /** Result from useDxccStatus hook */
  dxccStatus: DXCCStatusResult;
  /** Show inline detail on mobile instead of tooltip */
  showInlineDetail?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DxccStatusBadge({
  dxccStatus,
  showInlineDetail = false,
}: DxccStatusBadgeProps) {
  const { status, entity, tooltipText, loading, workedBands, isNewMultiplier } =
    dxccStatus;
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!showTooltip) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  // Don't render if no status or loading
  if (loading) {
    return (
      <div className="flex items-center h-8">
        <div className="w-16 h-5 rounded-full bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (!status || !entity) return null;

  const config = STATUS_CONFIG[status];

  return (
    <div className="flex flex-col gap-1">
      {/* Badge pill */}
      <div
        ref={badgeRef}
        className="relative inline-flex items-center"
        onMouseEnter={() => !showInlineDetail && setShowTooltip(true)}
        onMouseLeave={() => !showInlineDetail && setShowTooltip(false)}
        onClick={() => showInlineDetail && setShowTooltip((prev) => !prev)}
      >
        <span
          className={`
            inline-flex items-center gap-1.5
            px-2.5 py-1 rounded-full
            text-xs font-semibold
            border
            transition-all duration-200
            cursor-default select-none
            ${config.bg} ${config.text} ${config.border}
            ${config.pulse ? "animate-pulse" : ""}
          `}
        >
          {/* Status dot */}
          <span
            className={`
              w-1.5 h-1.5 rounded-full shrink-0
              ${status === "new_entity" ? "bg-alert-red" : ""}
              ${status === "new_band" ? "bg-signal-green" : ""}
              ${status === "new_mode" ? "bg-nebula-blue" : ""}
              ${status === "worked" ? "bg-plasma-orange" : ""}
              ${status === "dupe" ? "bg-gray-500" : ""}
            `}
          />
          {config.label}
        </span>

        {/* Contest multiplier indicator */}
        {isNewMultiplier && (
          <span
            className="
              inline-flex items-center
              px-1.5 py-0.5 rounded-full
              text-[10px] font-bold uppercase tracking-wider
              bg-caution-amber/15 text-caution-amber border border-caution-amber/30
              ml-1
            "
          >
            MULT
          </span>
        )}

        {/* Desktop tooltip */}
        {showTooltip && !showInlineDetail && tooltipText && (
          <div
            ref={tooltipRef}
            className="
              absolute left-0 top-full mt-1.5 z-50
              min-w-[260px] max-w-[340px]
              px-3 py-2 rounded-lg
              bg-void-black border border-white/10
              shadow-lg shadow-black/50
            "
            role="tooltip"
          >
            <p className="text-xs text-gray-300 leading-relaxed">
              {tooltipText}
            </p>
            {workedBands.length > 0 && status !== "new_entity" && (
              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">
                  Bands:
                </span>
                {workedBands.map((b) => (
                  <span
                    key={b}
                    className="
                      text-[10px] font-mono px-1.5 py-0.5 rounded
                      bg-white/5 text-gray-400
                    "
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile inline detail */}
      {showInlineDetail && showTooltip && tooltipText && (
        <div className="px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/5">
          <p className="text-xs text-gray-400 leading-relaxed">{tooltipText}</p>
          {workedBands.length > 0 && status !== "new_entity" && (
            <div className="mt-1 flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">
                Bands:
              </span>
              {workedBands.map((b) => (
                <span
                  key={b}
                  className="
                    text-[10px] font-mono px-1.5 py-0.5 rounded
                    bg-white/5 text-gray-400
                  "
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
