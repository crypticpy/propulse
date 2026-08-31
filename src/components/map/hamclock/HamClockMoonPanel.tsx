/**
 * Compact lunar ephemeris for the HamClock information rail.
 * Uses the same snapshot as the home dashboard Moon card so phase, rise/set,
 * and map-marker time all share one calculation path.
 */

import { useMemo } from "react";
import { getMoonConditions } from "@/lib/utils/moon";

interface HamClockMoonPanelProps {
  displayTime: Date;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
}

function formatTime(value: Date | null, timeZone?: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(value);
  } catch {
    return value.toISOString().slice(11, 16);
  }
}

export function HamClockMoonPanel({
  displayTime,
  latitude,
  longitude,
  timeZone,
}: HamClockMoonPanelProps) {
  const hasLocation = latitude !== undefined && longitude !== undefined;
  const snapshot = useMemo(
    () =>
      getMoonConditions(
        displayTime,
        latitude ?? 0,
        longitude ?? 0,
        timeZone,
      ),
    [displayTime, latitude, longitude, timeZone],
  );

  return (
    <div className="space-y-2" aria-label="Lunar conditions">
      <div className="flex items-center gap-2.5">
        <span className="text-3xl leading-none" aria-hidden="true">
          {snapshot.emoji}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {snapshot.phaseName}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-cosmic-cyan">
            {Math.round(snapshot.illumination * 100)}% illuminated
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between gap-1">
          <dt className="text-gray-500">Rise</dt>
          <dd className="font-mono tabular-nums text-gray-200">
            {hasLocation ? formatTime(snapshot.rise, timeZone) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-1">
          <dt className="text-gray-500">Set</dt>
          <dd className="font-mono tabular-nums text-gray-200">
            {hasLocation ? formatTime(snapshot.set, timeZone) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-1">
          <dt className="text-gray-500">Altitude</dt>
          <dd className="font-mono tabular-nums text-gray-200">
            {hasLocation ? `${Math.round(snapshot.altitude)}°` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-1">
          <dt className="text-gray-500">Azimuth</dt>
          <dd className="font-mono tabular-nums text-gray-200">
            {hasLocation ? `${Math.round(snapshot.azimuth)}°` : "—"}
          </dd>
        </div>
      </dl>

      <div className="border-t border-white/10 pt-1.5 font-mono text-[10px] text-gray-500">
        Distance {Math.round(snapshot.distanceKm).toLocaleString()} km
        {!hasLocation && " · set QTH for rise/set"}
      </div>
    </div>
  );
}

export default HamClockMoonPanel;
