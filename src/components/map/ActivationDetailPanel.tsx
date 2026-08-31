/**
 * ActivationDetailPanel — report, path, and operator context for a selected
 * portable activation.
 *
 * Map labels only contain enough information to scan the band quickly. This
 * portal dialog keeps the full report copyable, enriches the callsign from all
 * available QRZ/HamQTH/Callook sources, and can prepare (but never submit) a
 * QSO entry. Selecting the label has already made the activator the current map
 * target, so all existing propagation panels update from the same point.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useCallsignIngestion } from "@/hooks/useCallsignIngestion";
import {
  formatActivationFrequency,
  resolveActivationMarkers,
  type MappableActivationSpot,
} from "@/lib/map/activationMarkers";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import {
  formatBearing,
  formatDistance,
  getPathMetrics,
} from "@/lib/utils/path";
import { latLonToGrid } from "@/lib/utils/grid";
import { useActivationSpotStore } from "@/stores/activationSpotStore";
import { useQSOStore } from "@/stores/qsoStore";
import {
  ACTIVATION_PROGRAM_META,
  type ActivationProgram,
} from "@/types/activationSpots";

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right text-sm text-gray-200">
        {value}
      </dd>
    </div>
  );
}

function formatCoordinate(value: number, latitude: boolean): string {
  const suffix = latitude
    ? value >= 0
      ? "N"
      : "S"
    : value >= 0
      ? "E"
      : "W";
  return `${Math.abs(value).toFixed(3)}°${suffix}`;
}

function formatProfileSource(source: string): string {
  if (source === "qrz") return "QRZ";
  if (source === "hamqth") return "HamQTH";
  if (source === "callook") return "Callook";
  return source;
}

function ActivationOperatorContext({
  callsign,
  program,
}: {
  callsign: string;
  program: ActivationProgram;
}) {
  const profile = useCallsignIngestion(callsign);
  const programMeta = ACTIVATION_PROGRAM_META[program];

  return (
    <section aria-labelledby="activation-operator-heading">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3
          id="activation-operator-heading"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400"
        >
          Operator context
        </h3>
        <span className="text-right text-[10px] text-gray-500">
          {profile.result?.sources.length
            ? profile.result.sources.map(formatProfileSource).join(" + ")
            : "QRZ · HamQTH · Callook"}
        </span>
      </div>
      {profile.loading ? (
        <div className="h-20 animate-pulse rounded-lg bg-white/5" />
      ) : profile.result ? (
        <dl className="space-y-2 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          {profile.result.name && (
            <DataRow label="Operator" value={profile.result.name} />
          )}
          {(profile.result.qth || profile.result.country) && (
            <DataRow
              label="QTH"
              value={[profile.result.qth, profile.result.country]
                .filter(Boolean)
                .join(", ")}
            />
          )}
          {profile.result.grid && (
            <DataRow label="Profile grid" value={profile.result.grid} />
          )}
          {profile.result.licenseClass && (
            <DataRow label="License" value={profile.result.licenseClass} />
          )}
          {(profile.result.cqzone || profile.result.ituzone) && (
            <DataRow
              label="Zones"
              value={[
                profile.result.cqzone ? `CQ ${profile.result.cqzone}` : "",
                profile.result.ituzone ? `ITU ${profile.result.ituzone}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
          {profile.result.bio && (
            <DataRow label="Bio" value={profile.result.bio} />
          )}
        </dl>
      ) : (
        <p className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-gray-400">
          No enriched profile was returned by the available callsign sources.
          The live activation report above is still available.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <a
          href={`https://www.qrz.com/db/${encodeURIComponent(callsign)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cosmic-cyan hover:text-white"
        >
          Open QRZ.com ↗
        </a>
        <a
          href={programMeta.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cosmic-cyan hover:text-white"
        >
          {programMeta.source} ↗
        </a>
      </div>
    </section>
  );
}

function sameActivationIdentity(
  left: { program: ActivationProgram; callsign: string; reference: string },
  right: { program: ActivationProgram; callsign: string; reference: string },
): boolean {
  return (
    left.program === right.program &&
    left.callsign.trim().toUpperCase() ===
      right.callsign.trim().toUpperCase() &&
    left.reference.trim().toUpperCase() ===
      right.reference.trim().toUpperCase()
  );
}

function sameActivationReport(
  left: MappableActivationSpot,
  right: MappableActivationSpot,
): boolean {
  return (
    left.id === right.id &&
    left.program === right.program &&
    left.callsign === right.callsign &&
    left.reference === right.reference &&
    left.referenceName === right.referenceName &&
    left.frequencyKHz === right.frequencyKHz &&
    left.mode === right.mode &&
    left.comments === right.comments &&
    left.spotter === right.spotter &&
    left.spottedAt === right.spottedAt &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.grid === right.grid
  );
}

export function ActivationDetailPanel() {
  const navigate = useNavigate();
  const spot = useActivationSpotStore((state) => state.selectedSpot);
  const selectSpot = useActivationSpotStore((state) => state.selectSpot);
  const clearSpot = useActivationSpotStore((state) => state.clearSpot);
  const activationFeed = useActivationSpots(spot !== null);
  const location = useActiveLocation();
  const setField = useQSOStore((state) => state.setField);
  const resetForm = useQSOStore((state) => state.resetForm);
  const lookupCallsign = useQSOStore((state) => state.lookupCallsign);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const refreshedSpot = useMemo(() => {
    if (!spot) return null;
    return (
      resolveActivationMarkers(activationFeed.spots).find((candidate) =>
        sameActivationIdentity(candidate, spot),
      ) ?? null
    );
  }, [activationFeed.spots, spot]);

  const grid = useMemo(() => {
    if (!spot) return "";
    return spot.grid || latLonToGrid(spot.latitude, spot.longitude);
  }, [spot]);

  const path = useMemo(() => {
    if (!spot || !location) return null;
    return getPathMetrics(
      location.lat,
      location.lon,
      spot.latitude,
      spot.longitude,
    );
  }, [location, spot]);

  useEffect(() => {
    setCopyState("idle");
  }, [spot?.id]);

  useEffect(() => {
    if (!spot || activationFeed.isLoading || activationFeed.error) return;
    if (!refreshedSpot) {
      clearSpot();
      return;
    }
    // Provider IDs describe individual reports and may change when the same
    // activation moves frequency. Keep the open card bound to the stable
    // program/callsign/reference identity so it cannot prepare a stale QSO.
    if (!sameActivationReport(refreshedSpot, spot)) selectSpot(refreshedSpot);
  }, [
    activationFeed.error,
    activationFeed.isLoading,
    clearSpot,
    refreshedSpot,
    selectSpot,
    spot,
  ]);

  if (!spot) return null;

  const frequency = `${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "MHz" : "kHz"}`;
  const reportedAt = new Date(spot.spottedAt);
  const reportedAtLabel = Number.isNaN(reportedAt.getTime())
    ? spot.spottedAt
    : reportedAt.toLocaleString();

  const handleCopy = async () => {
    const details = [
      spot.callsign,
      `${frequency} ${spot.mode}`,
      `${spot.program} ${spot.reference} — ${spot.referenceName}`,
      `Grid: ${grid}`,
      `Coordinates: ${spot.latitude.toFixed(4)}, ${spot.longitude.toFixed(4)}`,
      `Spotted by: ${spot.spotter}`,
      `Reported: ${reportedAtLabel}`,
      spot.comments ? `Comments: ${spot.comments}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(details);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const handlePrepareQSO = () => {
    const band = bandFromFreq(spot.frequencyKHz);
    // Begin with the logger's configured sticky defaults so station identity,
    // contest, and serial data from a previous draft cannot leak into this
    // activation. This resets only the draft; it never submits a QSO.
    resetForm();
    setField("callsign", spot.callsign.toUpperCase());
    setField("frequency", spot.frequencyKHz);
    // An accepted activation can use a band outside the logger's current
    // mapping. Clear the sticky default in that case rather than mislabeling
    // (for example) a 222 MHz contact as the previous 20 m QSO.
    setField("band", band ?? "");
    setField("mode", spot.mode.toUpperCase());
    setField("grid", grid);
    setField("sig", spot.program);
    setField("sigInfo", spot.reference);
    setField(
      "notes",
      [
        `${spot.program} ${spot.reference} — ${spot.referenceName}`,
        spot.spotter ? `spotted by ${spot.spotter}` : "",
        spot.comments,
      ]
        .filter(Boolean)
        .join("; "),
    );
    // The shared lookup enriches name/QTH in the log form after navigation.
    // The activation's reported portable grid is authoritative for this QSO,
    // so profile/home-grid enrichment must not replace it. The call still is
    // not logged until the operator reviews and submits the prepared draft.
    void lookupCallsign(spot.callsign, { preserveGrid: true });
    clearSpot();
    navigate("/log");
  };

  return (
    <AccessibleDialog
      open
      onClose={clearSpot}
      title={`${spot.callsign} · ${spot.program}`}
      description="Selected as DX target · propagation panels updated"
      size="md"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="rounded border border-cosmic-cyan/30 bg-cosmic-cyan/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cosmic-cyan">
            {spot.program}
          </span>
          <span className="text-xs text-signal-green">Live activation report</span>
        </div>
          <section aria-labelledby="activation-report-heading">
            <h3
              id="activation-report-heading"
              className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400"
            >
              Reported activation
            </h3>
            <dl className="space-y-2 rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <DataRow
                label="Frequency"
                value={<span className="font-mono text-white">{frequency}</span>}
              />
              <DataRow label="Mode" value={spot.mode || "Unknown"} />
              <DataRow
                label="Reference"
                value={
                  <span>
                    <span className="font-mono text-white">{spot.reference}</span>
                    <span className="block text-xs text-gray-400">
                      {spot.referenceName}
                    </span>
                  </span>
                }
              />
              <DataRow label="Grid" value={<span className="font-mono">{grid}</span>} />
              <DataRow
                label="Coordinates"
                value={`${formatCoordinate(spot.latitude, true)}, ${formatCoordinate(spot.longitude, false)}`}
              />
              <DataRow label="Spotter" value={spot.spotter || "Not reported"} />
              <DataRow label="Reported" value={reportedAtLabel} />
              {spot.comments && <DataRow label="Comments" value={spot.comments} />}
            </dl>
          </section>

          <section aria-labelledby="activation-path-heading">
            <h3
              id="activation-path-heading"
              className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400"
            >
              Path from current location
            </h3>
            {path ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                  <div className="text-[10px] uppercase text-gray-500">Distance</div>
                  <div className="mt-1 font-mono text-sm text-white">
                    {formatDistance(path.shortPath.distance)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                  <div className="text-[10px] uppercase text-gray-500">Bearing</div>
                  <div className="mt-1 font-mono text-sm text-white">
                    {Math.round(path.shortPath.bearing)}° {formatBearing(path.shortPath.bearing)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                  <div className="text-[10px] uppercase text-gray-500">Est. hops</div>
                  <div className="mt-1 font-mono text-sm text-white">{path.hops}</div>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
                Set a current operating location to calculate this path.
              </p>
            )}
          </section>

          <ActivationOperatorContext
            key={spot.callsign.trim().toUpperCase()}
            callsign={spot.callsign}
            program={spot.program}
          />

        <footer className="grid grid-cols-1 gap-2 border-t border-white/10 bg-black/20 p-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
          >
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy details"}
          </button>
          <button
            type="button"
            onClick={clearSpot}
            className="rounded-lg border border-cosmic-cyan/30 bg-cosmic-cyan/10 px-3 py-2 text-sm text-cosmic-cyan transition-colors hover:bg-cosmic-cyan/20"
          >
            View path
          </button>
          <button
            type="button"
            onClick={handlePrepareQSO}
            className="rounded-lg border border-signal-green/30 bg-signal-green/10 px-3 py-2 text-sm font-medium text-signal-green transition-colors hover:bg-signal-green/20"
          >
            Prepare QSO
          </button>
        </footer>
      </div>
    </AccessibleDialog>
  );
}

export default ActivationDetailPanel;
