/**
 * MoonCard Component (G6)
 *
 * Dashboard card showing the moon's current phase, illumination,
 * rise/set times, altitude, and the next full/new moon dates for the
 * operator's QTH.
 *
 * @module components/dashboard/MoonCard
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useProfileStore } from "@/stores/profileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatLocal } from "@/lib/utils/time";
import { getMoonSnapshot } from "@/lib/utils/moon";

const RECOMPUTE_INTERVAL_MS = 60_000;

function formatTimeOrDash(date: Date | null, use24h: boolean): string {
  return date ? formatLocal(date, use24h) : "—";
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface MoonCardProps {
  className?: string;
}

export function MoonCard({ className = "" }: MoonCardProps) {
  const station = useProfileStore((s) => s.station);
  const use24h = useSettingsStore((s) => s.timeFormat === "24h");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const lat = station?.lat ?? 0;
  const lon = station?.lon ?? 0;
  const snapshot = getMoonSnapshot(now, lat, lon);
  const rising = snapshot.altitude > 0;

  return (
    <Card className={className} role="region" aria-label="Moon">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Moon
        </span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-4xl leading-none" aria-hidden="true">
          {snapshot.emoji}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {snapshot.phaseName}
          </div>
          <div className="text-xs text-gray-400 font-mono tabular-nums">
            {Math.round(snapshot.illumination * 100)}% illuminated
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs mb-2">
        <div>
          <span className="text-gray-500">Rise </span>
          <span className="text-gray-200 font-mono tabular-nums">
            {formatTimeOrDash(snapshot.rise, use24h)}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Set </span>
          <span className="text-gray-200 font-mono tabular-nums">
            {formatTimeOrDash(snapshot.set, use24h)}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Full </span>
          <span className="text-gray-200 font-mono tabular-nums">
            {formatShortDate(snapshot.nextFullMoon)}
          </span>
        </div>
        <div>
          <span className="text-gray-500">New </span>
          <span className="text-gray-200 font-mono tabular-nums">
            {formatShortDate(snapshot.nextNewMoon)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs text-gray-400 pt-2 border-t border-white/10">
        <span aria-hidden="true">{rising ? "▲" : "▼"}</span>
        <span className="font-mono tabular-nums">
          {Math.round(snapshot.altitude)}° altitude
        </span>
      </div>

      {!station && (
        <div className="mt-2 text-[10px] text-gray-500">
          Set your grid in Profile for accurate moon data
        </div>
      )}
    </Card>
  );
}

MoonCard.displayName = "MoonCard";

export default MoonCard;
