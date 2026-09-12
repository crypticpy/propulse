/**
 * Shared "Map orbit" / "Clear orbit" controls for satellite tracks (#994, #1083).
 *
 * One implementation backs the marker popup, SatelliteDetailModal, and
 * SatellitePanel rows so all three surfaces hit the same
 * setSatelliteTrack / clearSatelliteTrack store actions (capped at 5).
 */

import { useCallback, type MouseEvent } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SegmentedButton } from "@/components/settings/ui/SegmentedButton";
import { useMapStore, type SatelliteTrackConfig } from "@/stores/mapStore";

const ORBITS_AHEAD_OPTIONS: { value: "1" | "2" | "3"; label: string }[] = [
  { value: "1", label: "1 orbit" },
  { value: "2", label: "2 orbits" },
  { value: "3", label: "3 orbits" },
];

/**
 * Spelled-out Map orbit / Clear orbit toggle. `name` is stored on the track
 * so a later eviction can name the right bird (#994 PR B).
 */
export function OrbitTrackToggleButton({
  noradId,
  name,
}: {
  noradId: number;
  name: string;
}) {
  const id = String(noradId);
  const isTracked = useMapStore((s) => s.satelliteTracks[id] !== undefined);
  const setSatelliteTrack = useMapStore((s) => s.setSatelliteTrack);
  const clearSatelliteTrack = useMapStore((s) => s.clearSatelliteTrack);

  const handleToggleTrack = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (isTracked) {
        clearSatelliteTrack(noradId);
      } else {
        setSatelliteTrack(noradId, { name });
      }
    },
    [isTracked, noradId, name, clearSatelliteTrack, setSatelliteTrack],
  );

  return (
    <button
      type="button"
      onClick={handleToggleTrack}
      aria-pressed={isTracked}
      aria-label={`${isTracked ? "Clear orbit" : "Map orbit"} for ${name}`}
      className={`flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-su-line/60 ${
        isTracked
          ? "bg-su-accent/15 text-su-accent border border-su-accent/40 hover:bg-su-accent/25"
          : "bg-su-line/15 text-su-text border border-su-line/40 hover:bg-su-line/25"
      }`}
    >
      {isTracked ? "Clear orbit" : "Map orbit"}
    </button>
  );
}

/**
 * Map orbit toggle plus orbits-ahead / past / footprint controls, scoped to
 * one satellite by NORAD id.
 */
export function OrbitTrackControls({
  noradId,
  name,
}: {
  noradId: number;
  name: string;
}) {
  const id = String(noradId);
  const track = useMapStore((s) => s.satelliteTracks[id]);
  const trackCount = useMapStore(
    (s) => Object.keys(s.satelliteTracks).length,
  );
  const setSatelliteTrack = useMapStore((s) => s.setSatelliteTrack);
  const clearAllSatelliteTracks = useMapStore(
    (s) => s.clearAllSatelliteTracks,
  );

  const isTracked = track !== undefined;

  const handlePatch = useCallback(
    (patch: Partial<SatelliteTrackConfig>) => {
      setSatelliteTrack(noradId, patch);
    },
    [noradId, setSatelliteTrack],
  );

  return (
    <div className="mt-3 bg-su-line/10 rounded-md px-2.5 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-su-muted uppercase tracking-wider font-semibold">
          Map Orbit
        </span>
        {trackCount >= 2 && (
          <button
            type="button"
            onClick={() => clearAllSatelliteTracks()}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold border-su-line/40 text-su-muted hover:text-su-text hover:bg-su-line/15 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-su-line/60"
          >
            Clear all orbits ({trackCount})
          </button>
        )}
      </div>

      <OrbitTrackToggleButton noradId={noradId} name={name} />

      {isTracked && track && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <div className="text-xs text-su-muted mb-1.5">Orbits ahead</div>
            <SegmentedButton
              options={ORBITS_AHEAD_OPTIONS}
              value={String(track.orbitsAhead) as "1" | "2" | "3"}
              onChange={(value) =>
                handlePatch({ orbitsAhead: Number(value) as 1 | 2 | 3 })
              }
            />
          </div>

          <ToggleSwitch
            checked={track.showPast}
            onChange={(checked) => handlePatch({ showPast: checked })}
            label="Show past 45 minutes"
            description="Adds the trailing ground track behind the satellite"
          />

          <ToggleSwitch
            checked={track.showFootprint}
            onChange={(checked) => handlePatch({ showFootprint: checked })}
            label="Footprint"
            description="Shows this satellite's radio horizon on the globe"
          />
        </div>
      )}
    </div>
  );
}
