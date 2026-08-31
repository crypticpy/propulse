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

/**
 * METAR occasionally returns a station without an ICAO identifier. Keep the
 * React key deterministic in that degraded response instead of remounting the
 * row on every render (the old Math.random fallback discarded expanded state
 * and forced needless DOM work whenever any query state changed).
 */
function getMetarStationKey(station: MetarStation, index: number): string {
  if (station.icaoId) return station.icaoId;
  const identity = [station.name, station.lat, station.lon]
    .filter((part) => part != null && part !== "")
    .join("-");
  return `metar-${identity || "unknown"}-${index}`;
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
          {stations.map((station, index) => {
            const key = getMetarStationKey(station, index);
            const expanded = expandedId === key;
            const canExpand = Boolean(station.rawOb);
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(key)}
                  aria-expanded={canExpand ? expanded : undefined}
                  disabled={!canExpand}
                  className="group w-full min-w-0 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono font-semibold text-gray-200">
                      {station.icaoId ?? "—"}
                    </span>
                    {station.name && (
                      <span className="min-w-0 flex-1 truncate text-[10px] text-gray-500">
                        {station.name}
                      </span>
                    )}
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${flightCategoryStyle(station.fltCat)}`}
                    >
                      {station.fltCat ?? "?"}
                    </span>
                    {canExpand && (
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-[10px] text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`}
                      >
                        ▼
                      </span>
                    )}
                  </span>

                  {/* Stack labels over their values so the narrow four-column
                      dashboard card never depends on one long flex line. */}
                  <span className="mt-1 grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)_minmax(0,0.8fr)] gap-1.5">
                    <MetarMetric label="Temp" value={formatTemp(station.temp)} />
                    <MetarMetric label="Wind" value={formatWind(station)} />
                    <MetarMetric
                      label="Visibility"
                      value={formatVisibility(station.visib)}
                    />
                  </span>
                </button>
                {expanded && station.rawOb && (
                  <div className="break-all px-2 pb-2 pt-0.5 font-mono text-[10px] leading-4 text-gray-500">
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

function MetarMetric({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="min-w-0 rounded-md bg-white/[0.035] px-1.5 py-1"
      title={`${label}: ${value}`}
      data-metar-metric={label.toLowerCase()}
    >
      <span className="block truncate text-[9px] uppercase tracking-wide text-gray-600">
        {label}
      </span>
      <span className="block min-w-0 [overflow-wrap:anywhere] font-mono text-[10px] leading-4 tabular-nums text-gray-200">
        {value}
      </span>
    </span>
  );
}

MetarCard.displayName = "MetarCard";

export default MetarCard;
