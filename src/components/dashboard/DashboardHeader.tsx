/**
 * DashboardHeader Component
 *
 * A compact welcome strip at the top of the dashboard.
 * Shows branding, station callsign/grid, and live status indicator.
 */

import { useState, useEffect } from "react";
import { useUserStore } from "@/stores/userStore";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export interface DashboardHeaderProps {
  dataUpdatedAt?: number;
  className?: string;
}

export function DashboardHeader({
  dataUpdatedAt,
  className = "",
}: DashboardHeaderProps) {
  // Re-evaluate staleness every 30 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const isLive =
    dataUpdatedAt != null && Date.now() - dataUpdatedAt < STALE_THRESHOLD_MS;
  const station = useUserStore((state) => state.station);

  return (
    <div
      className={`bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 ${className}`}
    >
      {/* Left: Branding */}
      <span className="font-orbitron text-sm tracking-wider text-gradient-orange">
        PROPULSE DASHBOARD
      </span>

      {/* Center: Station info */}
      <div className="flex items-center gap-2 text-sm">
        {station?.callsign ? (
          <>
            <span className="font-mono font-medium text-white">
              {station.callsign}
            </span>
            {station.grid && (
              <span className="font-mono text-gray-400">{station.grid}</span>
            )}
          </>
        ) : (
          <span className="text-gray-400 text-xs">
            No Station Configured &mdash; use ⚙️ in header
          </span>
        )}
      </div>

      {/* Right: Live indicator */}
      <div
        className="flex items-center gap-2"
        aria-label={isLive ? "Data feed is live" : "Data feed is stale"}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isLive ? "bg-signal-green animate-pulse" : "bg-gray-500"
          }`}
        />
        <span
          className={`text-xs font-mono font-medium tracking-wider ${
            isLive ? "text-signal-green" : "text-gray-500"
          }`}
        >
          {isLive ? "LIVE" : "STALE"}
        </span>
      </div>
    </div>
  );
}
