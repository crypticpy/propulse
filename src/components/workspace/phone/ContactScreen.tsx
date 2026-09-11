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
 * shared operating-state roster (#658) whose `capabilities.canTune` and
 * `capabilities.canCommand` are both true — today, a non-wall canvas with a
 * bridge-connected rig (`useOperatingScreen`). The command names that exact
 * registration's `deviceId` + `workspaceId` (PR #694 review), so exactly one
 * screen acts even when several share a workspace id. TUNE is disabled with
 * a spelled-out reason when: the kill switch is off, no such registration is
 * live, the contact has no live spot to source a frequency from, or the
 * contact's band does not match the phone's own ladder selection (so a stale
 * cursor cannot send a frequency off the operator's selected band). A short
 * "SENT" / "FAILED: <reason>" line follows the button once the tuned screen
 * reports back (`tuneResult`) — TUNE was fire-and-forget before the review;
 * this makes the outcome honest instead of assuming success.
 *
 * The decision report's physics `mode` (PR #694 review, Codex thread
 * PRRT_kwDORFr4R86ggtq8) comes from the *contact's* live spot mode when it
 * has one — `calculateLUF`'s thresholds differ per mode, so building the
 * report with the phone's own station mode could show the wrong open/closed
 * call for a CW or FT8 contact. Falls back to the phone's own `physicsMode`
 * only when the spot carries no mode.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
import { toPhysicsMode } from "@/lib/station/stationPhysics";
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

/** How long the "SENT" / "FAILED: <reason>" line stays up after a tuneResult. */
const TUNE_FEEDBACK_MS = 5_000;

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

/** The first live, canTune + canCommand registration on the roster — the phone's remote target. */
function pickTuneWorkspace(
  registrations: Record<string, WorkspaceRegistration>,
  now: number,
): WorkspaceRegistration | null {
  for (const registration of Object.values(registrations)) {
    if (now - registration.lastSeen >= REGISTRATION_TTL_MS) continue;
    if (!registration.capabilities.canTune || !registration.capabilities.canCommand) continue;
    return registration;
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

/** "14195" kHz -> "14.195" MHz, matching the precision a rig actually tunes to. */
function formatFrequencyMhz(frequencyKHz: number): string {
  return (frequencyKHz / 1000).toFixed(3);
}

export function ContactScreen() {
  const target = useOperatingStateStore((state) => state.cursor.target);
  const ladderBand = useOperatingStateStore((state) => state.cursor.band);
  const registrations = useOperatingStateStore((state) => state.registrations);
  const followScreens = useOperatingStateStore((state) => state.followScreens);
  const lastCommand = useOperatingStateStore((state) => state.lastCommand);
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

  const pendingTuneRef = useRef<{ deviceId: string; workspaceId: string } | null>(null);
  const [tuneFeedback, setTuneFeedback] = useState<{ ok: boolean; reason: string | null } | null>(
    null,
  );

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

  // A tuneResult addressed to the exact screen this phone last sent a tune
  // to (PR #694 review): TUNE was fire-and-forget before this, so the button
  // could lie about whether the rig actually moved.
  useEffect(() => {
    if (!lastCommand || lastCommand.command.type !== "tuneResult") return;
    const pending = pendingTuneRef.current;
    if (!pending) return;
    const { command } = lastCommand;
    if (command.deviceId !== pending.deviceId || command.workspaceId !== pending.workspaceId) return;
    pendingTuneRef.current = null;
    setTuneFeedback({ ok: command.ok, reason: command.reason });
  }, [lastCommand]);

  useEffect(() => {
    if (!tuneFeedback) return;
    const timer = setTimeout(() => setTuneFeedback(null), TUNE_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [tuneFeedback]);

  const targetLatLon = useMemo(
    () => (target ? resolveTargetLatLon(target) : null),
    [target],
  );

  // PR #694 review (Codex): the contact's own live spot mode drives the
  // report's physics mode when it has one — `calculateLUF`'s thresholds are
  // per-mode, so building the report with the phone's own station mode could
  // show the wrong open/closed call for a CW or FT8 contact. Only the
  // phone's own station mode is a fallback, for a target with no live spot.
  const reportMode = targetSpot?.mode ? toPhysicsMode(targetSpot.mode) : physicsMode;

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
        mode: reportMode,
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
    reportMode,
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

  const bandMismatch =
    targetSpot?.band != null && ladderBand != null && targetSpot.band !== ladderBand
      ? { contactBand: targetSpot.band, ladderBand }
      : null;

  const tuneReason = !followScreens
    ? "Follow screens is off on this phone."
    : !tuneWorkspace
      ? "No workstation with a rig connected is on this session."
      : !targetSpot
        ? "No live frequency for this contact."
        : bandMismatch
          ? `Contact is on ${bandMismatch.contactBand}, ladder is on ${bandMismatch.ladderBand}.`
          : null;

  function handleTune() {
    if (!tuneWorkspace || !targetSpot) return;
    pendingTuneRef.current = { deviceId: tuneWorkspace.deviceId, workspaceId: tuneWorkspace.workspaceId };
    setTuneFeedback(null);
    useOperatingStateStore
      .getState()
      .tune(tuneWorkspace.deviceId, tuneWorkspace.workspaceId, targetSpot.frequency, targetSpot.mode ?? null);
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

          <div className="phone-contact-nearby">
            <p className="su-eyebrow">NEARBY SPOTS ({decision.nearby.count})</p>
            {decision.nearby.hits.length === 0 ? (
              <p className="su-hint">No spots within {decision.nearby.radiusKm} km.</p>
            ) : (
              <div role="list" aria-label="Nearby spots">
                {decision.nearby.hits.map((hit) => (
                  <div key={hit.id} role="listitem" className="phone-contact-nearby-row su-mono">
                    <span>{hit.dx}</span>
                    <span>{hit.band ?? "—"}</span>
                    <span className="su-hint">{spotAge(hit.observedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <Notice title="NO PATH REPORT">
          Could not compute a path report for this contact.
        </Notice>
      )}

      {targetSpot && (
        <p className="su-mono su-hint phone-tune-preview">
          {formatFrequencyMhz(targetSpot.frequency)} MHz {targetSpot.mode ?? "—"}
        </p>
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
      {tuneFeedback && (
        <p
          className={
            tuneFeedback.ok
              ? "su-hint phone-tune-feedback"
              : "phone-tune-feedback phone-tune-feedback-error"
          }
        >
          {tuneFeedback.ok ? "SENT" : `FAILED: ${tuneFeedback.reason ?? "Unknown reason."}`}
        </p>
      )}
    </div>
  );
}
