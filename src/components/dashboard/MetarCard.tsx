/**
 * MetarCard Component (E6 parity)
 *
 * Dashboard card showing the nearest METAR aviation weather stations to the
 * operator's QTH: flight category, temperature, wind, and visibility. Tap a
 * row to expand the raw METAR string inline.
 *
 * @module components/dashboard/MetarCard
 */

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useMetar, type MetarStation } from "@/hooks/useMetar";

const FLIGHT_CATEGORY_STYLES: Record<string, string> = {
  VFR: "bg-signal-green/15 border-signal-green/30 text-signal-green",
  MVFR: "bg-nebula-blue/15 border-nebula-blue/30 text-nebula-blue",
  IFR: "bg-alert-red/15 border-alert-red/30 text-alert-red",
  LIFR: "bg-aurora-purple/15 border-aurora-purple/30 text-aurora-purple",
};

function flightCategoryStyle(fltCat: string | null): string {
  if (!fltCat) return "bg-white/5 border-white/10 text-gray-400";
  return (
    FLIGHT_CATEGORY_STYLES[fltCat] ?? "bg-white/5 border-white/10 text-gray-400"
  );
}

function formatWind(station: MetarStation): string {
  if (station.wdir == null && station.wspd == null) return "—";
  const dir = station.wdir != null ? `${station.wdir}°` : "--";
  const spd = station.wspd != null ? `${station.wspd}kt` : "--";
  const gust = station.wgst != null ? ` G${station.wgst}` : "";
  return `${dir}/${spd}${gust}`;
}

function formatVisibility(visib: number | string | null): string {
  if (visib == null || visib === "") return "—";
  return `${visib}mi`;
}

function formatTemp(temp: number | null): string {
  if (temp == null) return "—";
  return `${Math.round(temp)}°C`;
}

export interface MetarCardProps {
  className?: string;
}

export function MetarCard({ className = "" }: MetarCardProps) {
  const { stations, hasLocation, isLoading, error } = useMetar();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = (icaoId: string | null) => {
    if (!icaoId) return;
    setExpandedId((current) => (current === icaoId ? null : icaoId));
  };

  return (
    <Card className={className} role="region" aria-label="METAR">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          METAR &mdash; Nearby Aviation Wx
        </span>
      </div>

      {!hasLocation && (
        <div className="text-[10px] text-gray-500">
          Set your grid in Profile for nearby aviation weather
        </div>
      )}

      {hasLocation && !isLoading && (error || stations.length === 0) && (
        <div className="text-xs text-gray-500">
          No METAR stations in range
        </div>
      )}

      {hasLocation && stations.length > 0 && (
        <div className="space-y-1">
          {stations.map((station) => {
            const key = station.icaoId ?? station.name ?? Math.random().toString();
            const expanded = expandedId === station.icaoId;
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(station.icaoId)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-2 text-xs text-left rounded px-1 py-1 hover:bg-white/5"
                >
                  <span className="font-mono text-gray-200 w-12 shrink-0">
                    {station.icaoId ?? "—"}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${flightCategoryStyle(station.fltCat)}`}
                  >
                    {station.fltCat ?? "?"}
                  </span>
                  <span className="text-gray-500">Temp </span>
                  <span className="text-gray-200 font-mono tabular-nums shrink-0">
                    {formatTemp(station.temp)}
                  </span>
                  <span className="text-gray-500">Wind </span>
                  <span className="text-gray-200 font-mono tabular-nums shrink-0">
                    {formatWind(station)}
                  </span>
                  <span className="text-gray-500">Vis </span>
                  <span className="text-gray-200 font-mono tabular-nums shrink-0">
                    {formatVisibility(station.visib)}
                  </span>
                </button>
                {expanded && station.rawOb && (
                  <div className="text-[10px] font-mono break-all text-gray-500 px-1 pb-1">
                    {station.rawOb}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

MetarCard.displayName = "MetarCard";

export default MetarCard;
