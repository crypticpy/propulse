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
  VFR: "bg-su-success/15 border-su-success/30 text-su-success",
  MVFR: "bg-su-info/15 border-su-info/30 text-su-info",
  IFR: "bg-su-danger/15 border-su-danger/30 text-su-danger",
  // LIFR keeps the aviation-standard magenta as its ink, so its tint drops to
  // /10 instead: purple-on-purple only clears 4.5:1 there (#791 measured /15
  // at 4.35:1 on the dark panel and 4.23:1 on the light canvas).
  LIFR: "bg-aurora-purple/10 border-aurora-purple/30 text-aurora-purple",
};

function flightCategoryStyle(fltCat: string | null): string {
  if (!fltCat) return "bg-su-input border-su-line/40 text-su-muted";
  return (
    FLIGHT_CATEGORY_STYLES[fltCat] ?? "bg-su-input border-su-line/40 text-su-muted"
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
  // NOAA can reorder nearby results as distances or observations change. An
  // index is therefore safe only for the pathological row that has no stable
  // identity fields at all; otherwise it would collapse an expanded station
  // merely because another airport entered or left the response.
  return identity ? `metar-${identity}` : `metar-unknown-${index}`;
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
        <span className="text-sm font-medium text-su-muted uppercase tracking-wide">
          METAR &mdash; Nearby Aviation Wx
        </span>
      </div>

      {!hasLocation && (
        <div className="text-sm text-su-muted/80">
          Set your grid in Profile for nearby aviation weather
        </div>
      )}

      {hasLocation && !isLoading && (error || stations.length === 0) && (
        <div className="text-sm text-su-muted/80">
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
                  className="group w-full min-w-0 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-su-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-su-accent/60 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono font-semibold text-su-text">
                      {station.icaoId ?? "—"}
                    </span>
                    {station.name && (
                      <span className="min-w-0 flex-1 truncate text-sm text-su-muted/80">
                        {station.name}
                      </span>
                    )}
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-sm ${flightCategoryStyle(station.fltCat)}`}
                    >
                      {station.fltCat ?? "?"}
                    </span>
                    {canExpand && (
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-sm text-su-muted/80 transition-transform ${expanded ? "rotate-180" : ""}`}
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
                  <div className="break-all px-2 pb-2 pt-0.5 font-mono text-sm leading-4 text-su-muted/80">
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
      className="min-w-0 rounded-md bg-su-input px-1.5 py-1"
      title={`${label}: ${value}`}
      data-metar-metric={label.toLowerCase()}
    >
      <span className="block truncate text-sm uppercase tracking-wide text-su-muted/80">
        {label}
      </span>
      <span className="block min-w-0 [overflow-wrap:anywhere] font-mono text-sm leading-4 tabular-nums text-su-text">
        {value}
      </span>
    </span>
  );
}

MetarCard.displayName = "MetarCard";

export default MetarCard;
