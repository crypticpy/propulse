/**
 * TidesCard Component (E6)
 *
 * Dashboard card showing the next high/low tide for the operator's QTH,
 * a 48h sparkline of the tide curve, and a rising/falling indicator.
 * Backed by the NOAA CO-OPS tide-prediction proxy (`/api/atmos/tides`).
 *
 * @module components/dashboard/TidesCard
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatLocal } from "@/lib/utils/time";
import {
  useTides,
  buildTideSparkline,
  findNextTideEvents,
  type TidePoint,
} from "@/hooks/useTides";

const RECOMPUTE_INTERVAL_MS = 60_000;
const FAR_STATION_THRESHOLD_KM = 150;

function parseNoaaTimeUtc(t: string): Date {
  return new Date(`${t.replace(" ", "T")}Z`);
}

function formatEventTime(event: TidePoint | null, use24h: boolean): string {
  return event ? formatLocal(parseNoaaTimeUtc(event.time), use24h) : "—";
}

export interface TidesCardProps {
  className?: string;
}

export function TidesCard({ className = "" }: TidesCardProps) {
  const use24h = useSettingsStore((s) => s.timeFormat === "24h");
  const { tides, isLoading, hasLocation } = useTides();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const header = (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
        Tides
      </span>
    </div>
  );

  if (!hasLocation) {
    return (
      <Card className={className} role="region" aria-label="Tides">
        {header}
        <div className="text-[10px] text-gray-500">
          Set your grid in Profile for tide data
        </div>
      </Card>
    );
  }

  const station = tides?.station ?? null;
  const curve = tides?.curve ?? [];
  const hilo = tides?.hilo ?? [];
  // Subordinate NOAA stations publish hilo predictions but no interval
  // curve — degrade only when there are no events at all.
  const degraded = !isLoading && (!tides || !station || hilo.length === 0);

  if (degraded) {
    return (
      <Card className={className} role="region" aria-label="Tides">
        {header}
        <div className="text-xs text-gray-500">Tide data unavailable</div>
      </Card>
    );
  }

  const { nextHigh, nextLow } = findNextTideEvents(hilo, now);
  const sparkline = buildTideSparkline(curve, now);

  let rising: boolean | null = null;
  if (nextHigh && nextLow) {
    rising =
      parseNoaaTimeUtc(nextHigh.time).getTime() <
      parseNoaaTimeUtc(nextLow.time).getTime();
  } else if (nextHigh) {
    rising = true;
  } else if (nextLow) {
    rising = false;
  }

  const distanceKm = station?.distanceKm ?? null;
  const isFar = distanceKm != null && distanceKm > FAR_STATION_THRESHOLD_KM;

  return (
    <Card className={className} role="region" aria-label="Tides">
      {header}

      <div className="mb-2 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {station?.name ?? "Unknown station"}
        </div>
        {distanceKm != null && (
          <div
            className={`text-xs font-mono tabular-nums ${
              isFar ? "text-caution-amber" : "text-gray-400"
            }`}
          >
            {distanceKm.toFixed(0)} km away{isFar ? " (not local)" : ""}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs mb-2">
        <div>
          <span className="text-gray-500">High </span>
          <span className="text-gray-200 font-mono tabular-nums">
            {formatEventTime(nextHigh, use24h)}
          </span>
          {nextHigh && (
            <span className="text-gray-500 font-mono tabular-nums">
              {" "}
              {nextHigh.heightM.toFixed(1)}m
            </span>
          )}
        </div>
        <div>
          <span className="text-gray-500">Low </span>
          <span className="text-gray-200 font-mono tabular-nums">
            {formatEventTime(nextLow, use24h)}
          </span>
          {nextLow && (
            <span className="text-gray-500 font-mono tabular-nums">
              {" "}
              {nextLow.heightM.toFixed(1)}m
            </span>
          )}
        </div>
      </div>

      {curve.length > 0 && (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="w-full h-10"
          role="img"
          aria-label="48 hour tide curve"
        >
          <polyline
            points={sparkline.points}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-gray-300"
          />
          {sparkline.nowX != null && (
            <line
              x1={sparkline.nowX}
              x2={sparkline.nowX}
              y1={0}
              y2={32}
              stroke="currentColor"
              strokeWidth={1}
              className="text-plasma-orange"
            />
          )}
        </svg>
      )}

      <div className="flex items-center gap-1 text-xs text-gray-400 pt-2 border-t border-white/10">
        <span aria-hidden="true">
          {rising === true ? "▲" : rising === false ? "▼" : "—"}
        </span>
        <span className="font-mono tabular-nums">
          {rising === true ? "Rising" : rising === false ? "Falling" : "—"}
        </span>
      </div>
    </Card>
  );
}

TidesCard.displayName = "TidesCard";

export default TidesCard;
