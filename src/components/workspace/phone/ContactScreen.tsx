/**
 * Phone page 4: contact (#660, epic #652, refs #632, #624).
 *
 * The #624 decision layer (`buildDecisionReport`) at phone density: verdict
 * tone + one-sentence reason, a path summary (bearing, distance, path MUF
 * when physics ran), the best greyline window, and observed nearby spots.
 * Physics (ITU-R P.533) + observed spots only — never VOACAP. NowCast is
 * intentionally not wired in here: `useNowCastBandPredictions` needs the
 * full station-chain gear context (`useStationCastContext`, radios/antennas/
 * feedlines) that the workstation's `PathAnalysis` panel already carries;
 * pulling that onto a phone contact card is disproportionate to this
 * screen's scope, so `nowCast` is passed `null` and the verdict falls back
 * to physics + observed spots, which `buildVerdict` already handles.
 *
 * QTH comes from `useActiveLocation()` (the operator's home/active saved
 * location); the target's lat/lon come from the cursor's `target` when a
 * spot supplied them, else from its Maidenhead grid (never a DXCC-prefix or
 * continent approximation — same "skip `dxLocApprox`" rule the decision
 * layer's own `nearbySpots.ts` follows).
 *
 * TUNE looks up the tapped spot's frequency/mode from the shared `useDXStore`
 * feed by `target.spotId` (the same store `PhoneContactList` reads), and
 * sends a `tune` command (#660) to the first live registration on the
 * shared operating-state roster (#658) whose `capabilities.canTune` is true
 * — today, a workstation with a bridge-connected rig
 * (`useOperatingScreen`). Disabled with a spelled-out reason otherwise.
 */

import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  buildDecisionReport,
  DEFAULT_NEARBY_RADIUS_KM,
  formatUtcHm,
  type DecisionReport,
  type DecisionTone,
} from "@/lib/map/decision";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { formatBearing, formatDistance, getPathMetrics } from "@/lib/utils/path";
import type { WorkspaceRegistration } from "@/lib/workspace/operatingChannel";
import { Badge, Button, EmptyState, Notice } from "@/components/station-ui";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import {
  REGISTRATION_TTL_MS,
  useOperatingStateStore,
} from "@/stores/operatingStateStore";
import { usePhoneTick } from "./usePhoneTick";

const TONE_BADGE: Record<DecisionTone, "success" | "warning" | "danger" | "neutral"> = {
  open: "success",
  window: "warning",
  closed: "danger",
  unknown: "neutral",
};

interface LatLon {
  lat: number;
  lon: number;
}

/** Locator-derived target position only; never a DXCC-prefix approximation. */
function resolveTargetLatLon(target: {
  lat: number | null;
  lon: number | null;
  grid: string | null;
}): LatLon | null {
  if (target.lat != null && target.lon != null) {
    return { lat: target.lat, lon: target.lon };
  }
  const grid = target.grid?.trim();
  if (!grid || !isValidGrid(grid)) return null;
  try {
    return gridToLatLon(grid);
  } catch {
    return null;
  }
}

/** The first live, canTune registration on the roster — the phone's remote target. */
function pickTuneWorkspace(
  registrations: Record<string, WorkspaceRegistration>,
  now: number,
): WorkspaceRegistration | null {
  for (const registration of Object.values(registrations)) {
    if (now - registration.lastSeen >= REGISTRATION_TTL_MS) continue;
    if (registration.capabilities.canTune) return registration;
  }
  return null;
}

function spotAge(observedAt: string | null): string {
  if (!observedAt) return "time unknown";
  const ms = Date.parse(observedAt);
  if (!Number.isFinite(ms)) return "time unknown";
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return `${minutes}m ago`;
}

export function ContactScreen() {
  const target = useOperatingStateStore((state) => state.cursor.target);
  const registrations = useOperatingStateStore((state) => state.registrations);
  const spots = useDXStore((state) => state.spots);
  const hiddenSpotIds = useDXStore((state) => state.hiddenSpotIds);
  const clusterFeed = useDXStore((state) => state.clusterFeed);
  const pathMode = useMapStore((state) => state.pathMode);
  const location = useActiveLocation();
  const { txPowerWatts, physicsMode } = useActiveStationGain();
  const { data: solarFluxData, dataUpdatedAt: fluxUpdatedAt } = useSolarFlux();
  const { data: kIndexData } = useKIndex();
  // Refreshes the report and the tune-eligible roster every 60s so neither
  // freezes at first-render values (pattern: PhoneBandLadder/PhoneContactList, #685 P3).
  const tick = usePhoneTick();

  const tuneWorkspace = useMemo(
    () => pickTuneWorkspace(registrations, Date.now()),
    // `tick` isn't read; it forces a periodic re-check of `lastSeen` against
    // `REGISTRATION_TTL_MS` so a workspace that went quiet ages off here too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registrations, tick],
  );

  const targetSpot = useMemo(
    () => spots.find((spot) => spot.id === target?.spotId) ?? null,
    [spots, target?.spotId],
  );

  const targetLatLon = useMemo(
    () => (target ? resolveTargetLatLon(target) : null),
    [target],
  );

  const decision = useMemo((): DecisionReport | null => {
    if (!target || !location || !targetLatLon) return null;
    const lastFlux = solarFluxData?.[solarFluxData.length - 1];
    const lastKp = kIndexData?.[kIndexData.length - 1];
    const visibleSpots =
      hiddenSpotIds.size === 0 ? spots : spots.filter((spot) => !hiddenSpotIds.has(spot.id));
    try {
      return buildDecisionReport({
        qth: { lat: location.lat, lon: location.lon, grid: location.grid },
        target: {
          lat: targetLatLon.lat,
          lon: targetLatLon.lon,
          name: target.callsign,
          grid: target.grid ?? undefined,
        },
        date: new Date(),
        pathMode: pathMode === "long" ? "long" : "short",
        sfi: lastFlux ? lastFlux.flux : null,
        sfiObservedAt: lastFlux?.time_tag ?? null,
        sfiFetchedAt: fluxUpdatedAt ? new Date(fluxUpdatedAt).toISOString() : null,
        kp: lastKp ? lastKp.kp_index : null,
        txPowerWatts,
        mode: physicsMode,
        spots: visibleSpots,
        spotsObservedAt: clusterFeed.observedAt,
        spotsFetchedAt: clusterFeed.fetchedAt,
        radiusKm: DEFAULT_NEARBY_RADIUS_KM,
        nowCast: null,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    target,
    location,
    targetLatLon,
    pathMode,
    solarFluxData,
    fluxUpdatedAt,
    kIndexData,
    txPowerWatts,
    physicsMode,
    spots,
    hiddenSpotIds,
    clusterFeed.observedAt,
    clusterFeed.fetchedAt,
    tick,
  ]);

  const pathSummary = useMemo(() => {
    if (!location || !targetLatLon) return null;
    const metrics = getPathMetrics(location.lat, location.lon, targetLatLon.lat, targetLatLon.lon);
    const leg = pathMode === "long" ? metrics.longPath : metrics.shortPath;
    return { distanceKm: leg.distance, bearing: leg.bearing };
  }, [location, targetLatLon, pathMode]);

  if (!target) {
    return (
      <EmptyState title="NO CONTACT SELECTED">
        Pick a contact on the CONTACTS page.
      </EmptyState>
    );
  }

  const tuneReason = !tuneWorkspace
    ? "No workstation with a rig connected is on this session."
    : !targetSpot
      ? "No live frequency for this contact."
      : null;

  function handleTune() {
    if (!tuneWorkspace || !targetSpot) return;
    useOperatingStateStore
      .getState()
      .tune(tuneWorkspace.workspaceId, targetSpot.frequency, targetSpot.mode ?? null);
  }

  return (
    <div className="phone-contact-screen su-stack">
      <div className="phone-contact-header">
        <h2 className="phone-selection-call">{target.callsign}</h2>
        <p className="su-mono su-hint">{target.grid ?? "—"}</p>
      </div>

      {!location ? (
        <Notice title="NO PATH REPORT">
          Set your QTH in Settings to see a path report.
        </Notice>
      ) : !targetLatLon ? (
        <Notice title="NO PATH REPORT">
          No grid for this contact — path report unavailable.
        </Notice>
      ) : decision ? (
        <>
          <Badge tone={TONE_BADGE[decision.verdict.tone]}>
            {decision.verdict.tone.toUpperCase()}
          </Badge>
          <p>{decision.verdict.line}</p>

          {pathSummary && (
            <div className="phone-contact-path su-mono">
              <span>{formatDistance(pathSummary.distanceKm)}</span>
              <span>{formatBearing(pathSummary.bearing)}</span>
              {decision.pathMuf && <span>MUF {decision.pathMuf.muf.toFixed(1)} MHz</span>}
            </div>
          )}

          <div className="phone-contact-window">
            <p className="su-eyebrow">BEST WINDOW</p>
            {decision.almanac.greyline.active || decision.almanac.greyline.start ? (
              <p>
                {decision.almanac.greyline.label}
                {decision.almanac.greyline.start && (
                  <>
                    {" · "}
                    {formatUtcHm(new Date(decision.almanac.greyline.start))}
                    {decision.almanac.greyline.end
                      ? `–${formatUtcHm(new Date(decision.almanac.greyline.end))}`
                      : ""}{" "}
                    UTC
                  </>
                )}
              </p>
            ) : (
              <p className="su-hint">No greyline window right now.</p>
            )}
          </div>

          <div className="phone-contact-nearby" role="list" aria-label="Nearby spots">
            <p className="su-eyebrow">NEARBY SPOTS ({decision.nearby.count})</p>
            {decision.nearby.hits.length === 0 ? (
              <p className="su-hint">No spots within {decision.nearby.radiusKm} km.</p>
            ) : (
              decision.nearby.hits.map((hit) => (
                <div key={hit.id} role="listitem" className="phone-contact-nearby-row su-mono">
                  <span>{hit.dx}</span>
                  <span>{hit.band ?? "—"}</span>
                  <span className="su-hint">{spotAge(hit.observedAt)}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <Notice title="NO PATH REPORT">
          Could not compute a path report for this contact.
        </Notice>
      )}

      <Button
        variant="primary"
        className="phone-tune-button"
        disabled={tuneReason !== null}
        onClick={handleTune}
        aria-label={tuneReason ? `Tune: ${tuneReason}` : undefined}
      >
        {tuneWorkspace ? `TUNE ON ${tuneWorkspace.label.toUpperCase()}` : "TUNE"}
      </Button>
      {tuneReason && <p className="su-hint phone-tune-reason">{tuneReason}</p>}
    </div>
  );
}
