/**
 * PlanetsCard Component (G16)
 *
 * Dashboard card listing the five naked-eye planets with their current
 * visibility window, magnitude, and (when visible) altitude/azimuth for
 * the operator's QTH.
 *
 * @module components/dashboard/PlanetsCard
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useProfileStore } from "@/stores/profileStore";
import { getPlanetVisibilities } from "@/lib/utils/planets";
import { formatAzimuth } from "@/lib/utils/satellite";
import type { PlanetVisibility } from "@/lib/utils/planets";

const RECOMPUTE_INTERVAL_MS = 60_000;

const VISIBILITY_META: Record<
  PlanetVisibility["visibility"],
  { label: string; colorClass: string }
> = {
  evening: { label: "Evening", colorClass: "text-plasma-orange" },
  morning: { label: "Morning", colorClass: "text-sky-400" },
  "all-night": { label: "All night", colorClass: "text-signal-green" },
  "not-visible": { label: "Not visible", colorClass: "text-gray-500" },
};

function PlanetRow({ planet }: { planet: PlanetVisibility }) {
  const meta = VISIBILITY_META[planet.visibility];
  const isVisible = planet.visibility !== "not-visible";

  return (
    <div
      className={`flex items-center justify-between gap-2 py-1.5 ${isVisible ? "" : "opacity-50"}`}
    >
      <span className="text-sm text-white w-16 shrink-0">
        {planet.planet}
      </span>
      <span
        className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${meta.colorClass}`}
      >
        {meta.label}
      </span>
      <span className="text-xs text-gray-400 font-mono tabular-nums shrink-0">
        mag {planet.magnitude.toFixed(1)}
      </span>
      <span className="text-xs text-gray-400 font-mono tabular-nums text-right flex-1 truncate">
        {isVisible
          ? `${Math.round(planet.altitude)}° ${formatAzimuth(planet.azimuth).split(" ")[1]}`
          : "—"}
      </span>
    </div>
  );
}

export interface PlanetsCardProps {
  className?: string;
}

export function PlanetsCard({ className = "" }: PlanetsCardProps) {
  const station = useProfileStore((s) => s.station);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const lat = station?.lat ?? 0;
  const lon = station?.lon ?? 0;
  const planets = getPlanetVisibilities(now, lat, lon);

  return (
    <Card className={className} role="region" aria-label="Planets">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Planets
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {planets.map((planet) => (
          <PlanetRow key={planet.planet} planet={planet} />
        ))}
      </div>

      {!station && (
        <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-gray-500">
          Set your grid in Profile for accurate visibility
        </div>
      )}
    </Card>
  );
}

PlanetsCard.displayName = "PlanetsCard";

export default PlanetsCard;
