/**
 * WorldClocksCard Component (G7)
 *
 * Dashboard card showing UTC plus a set of pinned world-city clocks, each
 * with a day-offset badge and a day/night dot. Inline edit mode (no
 * flyouts) lets the operator add, remove, and reorder cities.
 *
 * @module components/dashboard/WorldClocksCard
 */

import { useEffect, useState } from "react";
import SunCalc from "suncalc";
import { Card } from "@/components/ui/Card";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorldClockStore } from "@/stores/worldClockStore";
import { WORLD_CITIES, type WorldCity } from "@/lib/data/worldCities";

const TICK_INTERVAL_MS = 1_000;

function dayOffsetFor(tz: string, now: Date): number {
  const cityDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const localDateStr = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const cityDate = new Date(`${cityDateStr}T00:00:00Z`);
  const localDate = new Date(`${localDateStr}T00:00:00Z`);
  return Math.round((cityDate.getTime() - localDate.getTime()) / 86_400_000);
}

function formatDayOffset(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}d` : `−${Math.abs(offset)}d`;
}

function isDaytime(city: WorldCity, now: Date): boolean {
  return SunCalc.getPosition(now, city.lat, city.lon).altitude > 0;
}

function ClockRow({
  city,
  now,
  use24h,
  editing,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  city: WorldCity;
  now: Date;
  use24h: boolean;
  editing: boolean;
  onRemove: () => void;
  onMove: (direction: 1 | -1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: city.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24h,
  }).format(now);
  const offset = formatDayOffset(dayOffsetFor(city.tz, now));
  const day = isDaytime(city, now);

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${day ? "bg-yellow-300" : "bg-su-info"}`}
          aria-label={day ? "Daytime" : "Nighttime"}
        />
        <span className="text-sm text-su-text truncate">{city.city}</span>
        {offset && (
          <span className="text-sm text-su-muted/80 font-mono shrink-0">
            {offset}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-mono tabular-nums text-su-text">
          {time}
        </span>
        {editing && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={isFirst}
              className="text-su-muted hover:text-su-text disabled:opacity-30 px-1"
              aria-label={`Move ${city.city} up`}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={isLast}
              className="text-su-muted hover:text-su-text disabled:opacity-30 px-1"
              aria-label={`Move ${city.city} down`}
            >
              ▼
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-su-muted hover:text-su-danger px-1"
              aria-label={`Remove ${city.city}`}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export interface WorldClocksCardProps {
  className?: string;
}

export function WorldClocksCard({ className = "" }: WorldClocksCardProps) {
  const use24h = useSettingsStore((s) => s.timeFormat === "24h");
  const cityIds = useWorldClockStore((s) => s.cityIds);
  const addCity = useWorldClockStore((s) => s.addCity);
  const removeCity = useWorldClockStore((s) => s.removeCity);
  const moveCity = useWorldClockStore((s) => s.moveCity);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const cities = cityIds
    .map((id) => WORLD_CITIES.find((c) => c.id === id))
    .filter((c): c is WorldCity => c !== undefined);
  const availableCities = WORLD_CITIES.filter((c) => !cityIds.includes(c.id));
  const utcTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <Card className={className} role="region" aria-label="World clocks">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-su-muted uppercase tracking-wide">
          World Clocks
        </span>
        <button
          type="button"
          onClick={() => setEditing((prev) => !prev)}
          className="text-sm text-su-muted hover:text-su-text uppercase tracking-wide"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 py-1.5 border-b border-su-line/40 mb-1">
        <span className="text-sm text-su-text">UTC</span>
        <span className="text-sm font-mono tabular-nums text-su-text">
          {utcTime}
        </span>
      </div>

      <div className="divide-y divide-su-line/20">
        {cities.map((city, index) => (
          <ClockRow
            key={city.id}
            city={city}
            now={now}
            use24h={use24h}
            editing={editing}
            onRemove={() => removeCity(city.id)}
            onMove={(direction) => moveCity(city.id, direction)}
            isFirst={index === 0}
            isLast={index === cities.length - 1}
          />
        ))}
      </div>

      {editing && availableCities.length > 0 && (
        <div className="mt-2 pt-2 border-t border-su-line/40">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addCity(e.target.value);
            }}
            className="w-full text-sm bg-su-input border border-su-line/40 rounded-lg px-2 py-1.5 text-su-muted"
            aria-label="Add city"
          >
            <option value="">Add city…</option>
            {availableCities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city}, {city.country}
              </option>
            ))}
          </select>
        </div>
      )}
    </Card>
  );
}

WorldClocksCard.displayName = "WorldClocksCard";

export default WorldClocksCard;
