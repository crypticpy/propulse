/**
 * Shared recent-activity explorer for Home and PropSphere.
 * Reports show who was heard or spotted; they are not decoded audio or proof
 * of a two-way QSO, which is stated explicitly in the UI.
 */

import { useEffect, useMemo, useState } from "react";
import { useStore, type StoreApi } from "zustand";
import { useNavigate } from "react-router-dom";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import {
  buildActivityResults,
  parseActivityFrequency,
  type ActivityResult,
} from "@/lib/activity/activityExplorer";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { getBandColor } from "@/lib/utils/spotColors";
import { createGuestActivityExplorerStore, useActivityExplorerStore, type ActivityExplorerStore } from "@/stores/activityExplorerStore";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import type { LiveSpot } from "@/types/livespot";

interface NearbyActivityExplorerProps {
  publicOnly?: boolean;
  filterStore?: StoreApi<ActivityExplorerStore>;
  /** Home supplies the active setup location; other callers keep their QTH. */
  locationOverride?: { lat: number; lon: number; grid: string } | null;
  className?: string;
  onClose?: () => void;
}

const SOURCE_LABELS = {
  PSKReporter: "PSK",
  RBN: "RBN",
  Cluster: "DXC",
  "WSJT-X": "LOCAL",
} as const;

function formatFrequency(frequencyKHz: number): string {
  return `${(frequencyKHz / 1000).toFixed(3)} MHz`;
}

function formatAge(time: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - time.getTime()) / 60_000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function ActivityRow({
  result,
  now,
  expanded,
  onToggle,
  onTarget,
}: {
  result: ActivityResult;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
  onTarget?: () => void;
}) {
  const path =
    result.distanceKm === null
      ? "Location unknown"
      : `${result.locationApproximate ? "~" : ""}${Math.round(result.distanceKm).toLocaleString()} km · ${Math.round(result.bearing ?? 0)}° ${result.bearingLabel}`;

  return (
    <div className="border-b border-su-line/20 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="grid min-h-11 w-full grid-cols-[minmax(5rem,0.8fr)_minmax(6.5rem,1fr)_4rem] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-su-line/10 sm:grid-cols-[minmax(5rem,0.7fr)_minmax(7rem,1fr)_5rem_4rem_minmax(8rem,1fr)]"
      >
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm font-bold text-su-text">
            {result.callsign}
          </span>
          <span className="block truncate text-[10px] text-su-muted sm:hidden">
            {result.mode ?? "?"} · {path}
          </span>
        </span>
        <span className="truncate font-mono text-xs text-cosmic-cyan">
          {formatFrequency(result.frequencyKHz)}
        </span>
        <span className="hidden truncate text-xs text-su-muted sm:block">
          {result.mode ?? "—"}
        </span>
        <span className="font-mono text-xs tabular-nums text-su-muted">
          {formatAge(result.time, now)}
        </span>
        <span className="hidden truncate font-mono text-[11px] text-su-muted sm:block">
          {path}
        </span>
      </button>

      {expanded && (
        <div className="grid gap-3 bg-su-line/10 px-3 py-3 text-xs sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5 text-su-muted">
            <div>
              <span className="text-su-muted">Heard / reported by </span>
              <span className="font-mono text-su-text">
                {result.heardBy.length > 0 ? result.heardBy.join(", ") : "Unknown"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {result.sources.map((source) => (
                <span
                  key={source}
                  className="rounded border border-su-line/40 bg-su-line/10 px-1.5 py-0.5 font-mono text-[10px] text-su-muted"
                >
                  {SOURCE_LABELS[source]}
                </span>
              ))}
              <span className="text-su-muted">
                {result.reportCount} report{result.reportCount === 1 ? "" : "s"}
              </span>
              {result.snr !== undefined && (
                <span className="font-mono text-su-muted">SNR {result.snr} dB</span>
              )}
            </div>
          </div>
          {onTarget && result.lat !== undefined && result.lon !== undefined && (
            <button
              type="button"
              onClick={onTarget}
              className="min-h-10 rounded-lg border border-plasma-orange/40 bg-plasma-orange/10 px-3 py-2 font-medium text-su-text transition-colors hover:bg-plasma-orange/20"
            >
              Target in PropSphere
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NearbyActivityExplorer({
  className = "",
  onClose,
  locationOverride,
  publicOnly = false,
  filterStore,
}: NearbyActivityExplorerProps) {
  const navigate = useNavigate();
  const [guestFilters] = useState(createGuestActivityExplorerStore);
  const defaultLocation = useActiveLocation();
  const activeLocation = locationOverride === undefined ? defaultLocation : locationOverride;
  const live = useLiveSpots({
    grid: activeLocation?.grid,
    enabled: Boolean(activeLocation),
    deduplicate: false,
    ...(publicOnly ? { sources: ["PSKReporter", "RBN"] as ("PSKReporter" | "RBN")[] } : {}),
  });
  const clusterSpots = useDXStore((state) => state.spots);
  const setTarget = useMapStore((state) => state.setTarget);
  const {
    mode,
    band,
    frequencyInput,
    toleranceKHz,
    maxAgeMinutes,
    maxDistanceKm,
    setMode,
    setBand,
    setFrequencyInput,
    setToleranceKHz,
    setMaxAgeMinutes,
    setMaxDistanceKm,
  } = useStore(filterStore ?? (publicOnly ? guestFilters : useActivityExplorerStore));
  const [now, setNow] = useState(() => new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const frequencyKHz = parseActivityFrequency(frequencyInput);
  const combinedSpots = useMemo<LiveSpot[]>(
    () => [
      ...live.spots,
      ...(publicOnly ? [] : clusterSpots).map((spot) => ({ ...spot, source: "Cluster" as const })),
    ],
    [clusterSpots, live.spots, publicOnly],
  );
  const results = useMemo(() => {
    if (!activeLocation || (mode === "frequency" && frequencyKHz === null)) {
      return [];
    }
    return buildActivityResults(
      combinedSpots,
      { lat: activeLocation.lat, lon: activeLocation.lon },
      {
        query:
          mode === "band"
            ? { kind: "band", band }
            : {
                kind: "frequency",
                frequencyKHz: frequencyKHz!,
                toleranceKHz,
              },
        maxAgeMinutes,
        maxDistanceKm,
        now,
      },
    );
  }, [
    activeLocation,
    band,
    combinedSpots,
    frequencyKHz,
    maxAgeMinutes,
    maxDistanceKm,
    mode,
    now,
    toleranceKHz,
  ]);

  const handleTarget = (result: ActivityResult) => {
    if (publicOnly || result.lat === undefined || result.lon === undefined) return;
    setTarget({
      lat: result.lat,
      lon: result.lon,
      name: result.callsign,
    });
    onClose?.();
    navigate("/map");
  };

  const loading = live.isLoading;
  const queryLabel =
    mode === "band"
      ? band
      : frequencyKHz === null
        ? "invalid frequency"
        : `${formatFrequency(frequencyKHz)} ±${toleranceKHz} kHz`;

  return (
    <section
      className={`overflow-hidden rounded-xl border border-su-line/40 bg-nebula-blue/55 ${className}`}
      aria-label="Nearby on-air activity"
    >
      <div className="border-b border-su-line/40 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-signal-green" />
              <h2 className="font-orbitron text-xs font-semibold uppercase tracking-wider text-su-text">
                Nearby Activity
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-su-muted">
              Recent reception and cluster reports near your active location—not decoded audio or confirmed QSOs.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="pt-0.5 font-mono text-[10px] text-su-muted">
              {results.length} active · {queryLabel}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close nearby activity"
                className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-su-muted transition-colors hover:bg-su-line/20 hover:text-su-text"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 3L11 11M11 3L3 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-su-line/40 bg-void-black/40 p-0.5">
            {(["band", "frequency"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors ${
                  mode === value
                    ? "bg-plasma-orange/20 text-su-text"
                    : "text-su-muted hover:text-su-text"
                }`}
              >
                {value === "band" ? "Band" : "Frequency"}
              </button>
            ))}
          </div>

          {mode === "band" ? (
            <label className="text-[10px] uppercase tracking-wide text-su-muted">
              Band
              <select
                value={band}
                onChange={(event) => setBand(event.target.value)}
                className="mt-1 block min-h-9 rounded-lg border border-su-line/40 bg-deep-space px-3 font-mono text-xs normal-case text-su-text focus:border-plasma-orange/50 focus:outline-none"
              >
                {BAND_ORDER.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-[10px] uppercase tracking-wide text-su-muted">
                Frequency
                <input
                  value={frequencyInput}
                  onChange={(event) => setFrequencyInput(event.target.value)}
                  inputMode="decimal"
                  placeholder="7.200 MHz"
                  aria-invalid={frequencyKHz === null}
                  className={`mt-1 block min-h-9 w-32 rounded-lg border bg-deep-space px-3 font-mono text-xs normal-case text-su-text focus:outline-none ${
                    frequencyKHz === null
                      ? "border-alert-red/60"
                      : "border-su-line/40 focus:border-plasma-orange/50"
                  }`}
                />
              </label>
              <label className="text-[10px] uppercase tracking-wide text-su-muted">
                Tolerance
                <select
                  value={toleranceKHz}
                  onChange={(event) => setToleranceKHz(Number(event.target.value))}
                  className="mt-1 block min-h-9 rounded-lg border border-su-line/40 bg-deep-space px-2 font-mono text-xs normal-case text-su-text focus:border-plasma-orange/50 focus:outline-none"
                >
                  {[0.5, 1, 3, 5].map((value) => (
                    <option key={value} value={value}>
                      ±{value} kHz
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="text-[10px] uppercase tracking-wide text-su-muted">
            Recent
            <select
              value={maxAgeMinutes}
              onChange={(event) => setMaxAgeMinutes(Number(event.target.value))}
              className="mt-1 block min-h-9 rounded-lg border border-su-line/40 bg-deep-space px-2 font-mono text-xs normal-case text-su-text focus:border-plasma-orange/50 focus:outline-none"
            >
              {[5, 15, 30, 60].map((value) => (
                <option key={value} value={value}>
                  {value} min
                </option>
              ))}
            </select>
          </label>

          <label className="text-[10px] uppercase tracking-wide text-su-muted">
            Range
            <select
              value={maxDistanceKm ?? "global"}
              onChange={(event) =>
                setMaxDistanceKm(
                  event.target.value === "global"
                    ? null
                    : Number(event.target.value),
                )
              }
              className="mt-1 block min-h-9 rounded-lg border border-su-line/40 bg-deep-space px-2 font-mono text-xs normal-case text-su-text focus:border-plasma-orange/50 focus:outline-none"
            >
              <option value={500}>500 km</option>
              <option value={1500}>1,500 km</option>
              <option value={5000}>5,000 km</option>
              <option value={10000}>10,000 km</option>
              <option value="global">Global</option>
            </select>
          </label>
        </div>
      </div>

      {!activeLocation ? (
        <div className="px-4 py-8 text-center text-sm text-su-muted">
          Set a home or current travel location to calculate nearby activity.
        </div>
      ) : frequencyKHz === null && mode === "frequency" ? (
        <div className="px-4 py-8 text-center text-sm text-alert-red">
          Enter a frequency such as 7.200 MHz or 7200 kHz.
        </div>
      ) : loading && results.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-su-muted">
          Loading recent reports…
        </div>
      ) : live.isError && results.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-alert-red">
          Live activity sources are unavailable. Check the data connection and
          try again.
        </div>
      ) : results.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-su-muted">
          No recent {queryLabel} reports in this distance and time window.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto" role="list">
          {results.map((result) => (
            <div key={result.id} role="listitem" style={{ borderLeft: `2px solid ${getBandColor(result.frequencyKHz)}` }}>
              <ActivityRow
                result={result}
                now={now}
                expanded={expandedId === result.id}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === result.id ? null : result.id,
                  )
                }
                onTarget={publicOnly ? undefined : () => handleTarget(result)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default NearbyActivityExplorer;
