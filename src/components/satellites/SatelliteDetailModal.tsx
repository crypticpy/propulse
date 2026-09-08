/**
 * SatelliteDetailModal -- Centered modal with detailed satellite information.
 *
 * Replaces inline card expansion with a proper centered modal that includes:
 * About (from satelliteDescriptions DB), Current Position, Transponders,
 * Next Pass, and Orbit Info sections.
 *
 * UX: centered modal with backdrop, escape key closes, click-outside closes.
 * NO flyout/slide-in panels.
 */

import { useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  CATEGORY_META,
  formatFreqMHz,
  formatLatLon,
  formatAzimuth,
} from "@/lib/utils/satellite";
import { getSatelliteDescription } from "@/lib/data/satelliteDescriptions";
import type { SatelliteMetadata } from "@/lib/data/satelliteDescriptions";
import { getTransponder } from "@/lib/data/satelliteTransponders";
import { useSatNOGS } from "@/hooks/useSatNOGS";
import { useAMSATStatus } from "@/hooks/useAMSATStatus";
import type {
  SatelliteInfoExtended,
  PassPrediction,
  SatNOGSTransmitter,
} from "@/types/satellite";
import type { AMSATOperationalStatus } from "@/types/amsat";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SatelliteDetailModalProps {
  satellite: SatelliteInfoExtended;
  nextPass: PassPrediction | null;
  isTracked: boolean;
  onTrackToggle: (noradId: number, track: boolean) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Status badge color mapping */
const STATUS_COLORS: Record<string, string> = {
  active: "text-signal-green bg-signal-green/15 border-signal-green/30",
  "semi-active":
    "text-caution-amber bg-caution-amber/15 border-caution-amber/30",
  inactive: "text-alert-red bg-alert-red/15 border-alert-red/30",
  unknown: "text-su-muted bg-su-line/10 border-su-line/60",
};

/** AMSAT operational status badge styles */
const AMSAT_STATUS_STYLES: Record<
  AMSATOperationalStatus,
  { badge: string; dot: string; label: string }
> = {
  active: {
    badge: "bg-signal-green/15 text-signal-green border-signal-green/30",
    dot: "bg-signal-green animate-pulse",
    label: "Active",
  },
  "semi-active": {
    badge: "bg-caution-amber/15 text-caution-amber border-caution-amber/30",
    dot: "bg-caution-amber",
    label: "Intermittent",
  },
  inactive: {
    badge: "bg-alert-red/15 text-alert-red border-alert-red/30",
    dot: "bg-alert-red",
    label: "Inactive",
  },
  unknown: {
    badge: "bg-su-line/10 text-su-muted border-su-line/30",
    dot: "bg-su-line",
    label: "Unknown",
  },
};

/** Format pass time as relative duration string */
function formatPassTime(pass: PassPrediction): string {
  const now = new Date();
  const aosDate =
    pass.aos instanceof Date
      ? pass.aos
      : new Date(pass.aos as unknown as string);

  if (aosDate <= now) {
    return "Now";
  }

  return formatDistanceToNow(aosDate, { addSuffix: true });
}

/** TLE age badge styling */
function getTleAgeBadge(age: "fresh" | "aging" | "stale") {
  switch (age) {
    case "fresh":
      return {
        label: "Fresh",
        className:
          "bg-signal-green/15 text-signal-green border-signal-green/30",
      };
    case "aging":
      return {
        label: "Aging",
        className:
          "bg-caution-amber/15 text-caution-amber border-caution-amber/30",
      };
    case "stale":
      return {
        label: "Stale",
        className: "bg-alert-red/15 text-alert-red border-alert-red/30",
      };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section wrapper with header */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-widest text-su-muted mb-1.5">
        {title}
      </h4>
      <div className="bg-su-line/10 rounded-xl p-3">{children}</div>
    </div>
  );
}

/** Determine whether a SatNOGS transmitter is simplex */
function isSimplex(tx: SatNOGSTransmitter): boolean {
  if (
    tx.uplink_low != null &&
    tx.downlink_low != null &&
    tx.uplink_low === tx.uplink_high &&
    tx.downlink_low === tx.downlink_high &&
    tx.uplink_low === tx.downlink_low
  ) {
    return true;
  }
  return false;
}

/** Render frequency info for a single SatNOGS transmitter row */
function SatNOGSTransmitterRow({ tx }: { tx: SatNOGSTransmitter }) {
  const statusStyle =
    tx.status === "active"
      ? "bg-signal-green"
      : tx.status === "inactive"
        ? "bg-alert-red"
        : "bg-su-line";

  const simplex = isSimplex(tx);

  return (
    <div className="bg-su-line/10 rounded-lg px-2.5 py-2 text-xs">
      {/* Header: description, mode, status */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusStyle}`}
          />
          <span className="text-su-text font-medium truncate">
            {tx.description || "Unnamed"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {tx.mode && (
            <span className="text-su-muted uppercase text-[10px]">
              {tx.mode}
            </span>
          )}
          <span className="text-su-muted uppercase text-[10px]">{tx.type}</span>
          {tx.invert && (
            <span className="text-caution-amber/70 text-[10px]">inv</span>
          )}
        </div>
      </div>

      {/* Frequencies */}
      <div className="flex gap-3 font-mono text-su-muted">
        {simplex && tx.downlink_low != null ? (
          <span>{formatFreqMHz(tx.downlink_low)} (simplex)</span>
        ) : (
          <>
            {tx.uplink_low != null && (
              <span>
                UP {formatFreqMHz(tx.uplink_low)}
                {tx.uplink_high != null &&
                  tx.uplink_high !== tx.uplink_low &&
                  ` - ${formatFreqMHz(tx.uplink_high)}`}
              </span>
            )}
            {tx.downlink_low != null && (
              <span>
                DN {formatFreqMHz(tx.downlink_low)}
                {tx.downlink_high != null &&
                  tx.downlink_high !== tx.downlink_low &&
                  ` - ${formatFreqMHz(tx.downlink_high)}`}
              </span>
            )}
          </>
        )}
      </div>

      {/* Baud rate if available */}
      {tx.baud != null && tx.baud > 0 && (
        <div className="text-su-muted mt-0.5 text-[10px]">{tx.baud} baud</div>
      )}
    </div>
  );
}

/** Small loading spinner for inline use */
function MiniSpinner() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-3 h-3 border border-su-line border-t-plasma-orange rounded-full animate-spin" />
      <span className="text-xs text-su-muted">Loading...</span>
    </div>
  );
}

/** About section showing satellite description and metadata */
function AboutSection({ meta }: { meta: SatelliteMetadata }) {
  return (
    <Section title="About">
      <p className="text-sm text-su-muted leading-relaxed mb-2">
        {meta.description}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-su-muted">Operator: </span>
          <span className="text-su-muted">{meta.operator}</span>
        </div>
        <div>
          <span className="text-su-muted">Launch: </span>
          <span className="text-su-muted">{meta.launchYear}</span>
        </div>
        <div>
          <span className="text-su-muted">Orbit: </span>
          <span className="text-su-muted">{meta.orbitType}</span>
        </div>
        <div>
          <span className="text-su-muted">Purpose: </span>
          <span className="text-su-muted">{meta.purpose}</span>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SatelliteDetailModal({
  satellite,
  nextPass,
  isTracked,
  onTrackToggle,
  onClose,
}: SatelliteDetailModalProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [handleKeyDown]);

  // Live data hooks — SatNOGS transmitters + AMSAT community status
  const { transmitters: satnogsTransmitters, isLoading: satnogsLoading } =
    useSatNOGS(satellite.noradId);
  const { status: amsatStatus, isLoading: amsatLoading } = useAMSATStatus(
    satellite.name,
  );

  const catMeta = CATEGORY_META[satellite.category];
  const tleAgeBadge = getTleAgeBadge(satellite.tleAge);
  const transponder = getTransponder(satellite.name, satellite.noradId);
  const description =
    getSatelliteDescription(satellite.noradId) ??
    getSatelliteDescription(satellite.name);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTrackToggle(satellite.noradId, !isTracked);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not the modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-[200]" aria-hidden="true" />

      {/* Modal container — click outside to close */}
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center p-4"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-label={`${satellite.name} satellite details`}
      >
        <div className="bg-deep-space/95 backdrop-blur-xl border border-su-line/40 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-deep-space/95 backdrop-blur-xl rounded-t-2xl border-b border-su-line/20 p-4 pb-3 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Satellite name */}
                <h2 className="text-xl font-bold text-su-text truncate">
                  {satellite.name}
                </h2>
                {/* Subtitle: NORAD + Category + Status */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-su-muted font-mono">
                    NORAD {satellite.noradId}
                  </span>
                  <span className="text-su-muted">·</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${catMeta.bg} ${catMeta.color}`}
                  >
                    {catMeta.label}
                  </span>
                  {description && (
                    <>
                      <span className="text-su-muted">·</span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize border ${STATUS_COLORS[description.status] ?? STATUS_COLORS.unknown}`}
                      >
                        {description.status}
                      </span>
                    </>
                  )}
                  {satellite.isCustom && (
                    <>
                      <span className="text-su-muted">·</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        Custom
                      </span>
                    </>
                  )}
                  {/* AMSAT operational status badge */}
                  {amsatLoading && (
                    <>
                      <span className="text-su-muted">·</span>
                      <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-su-line/10 animate-pulse">
                        <span className="w-8 h-2 rounded bg-su-input" />
                      </span>
                    </>
                  )}
                  {!amsatLoading && amsatStatus && (
                    <>
                      <span className="text-su-muted">·</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${AMSAT_STATUS_STYLES[amsatStatus.status].badge}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${AMSAT_STATUS_STYLES[amsatStatus.status].dot}`}
                        />
                        {AMSAT_STATUS_STYLES[amsatStatus.status].label}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Track toggle */}
                <button
                  onClick={handleToggle}
                  aria-label={
                    isTracked ? "Untrack satellite" : "Track satellite"
                  }
                  aria-pressed={isTracked}
                  className="relative w-[44px] h-[24px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50"
                  style={{
                    backgroundColor: isTracked
                      ? "rgba(34, 197, 94, 0.4)"
                      : "rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <span
                    className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full transition-transform duration-200 ${
                      isTracked
                        ? "translate-x-[20px] bg-signal-green"
                        : "translate-x-0 bg-su-line"
                    }`}
                  />
                </button>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="text-su-muted hover:text-su-text transition-colors p-1 rounded-lg hover:bg-su-line/20"
                  aria-label="Close"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 pt-3 space-y-3">
            {/* About section — only if we have metadata */}
            {description && <AboutSection meta={description} />}

            {/* Current Position */}
            <Section title="Current Position">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <span className="text-su-muted">Lat/Lon: </span>
                  <span className="text-su-muted font-mono">
                    {formatLatLon(
                      satellite.position.lat,
                      satellite.position.lon,
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-su-muted">Altitude: </span>
                  <span className="text-su-muted font-mono">
                    {satellite.position.alt.toFixed(1)} km
                  </span>
                </div>
                <div>
                  <span className="text-su-muted">Velocity: </span>
                  <span className="text-su-muted font-mono">
                    {satellite.position.velocity.toFixed(2)} km/s
                  </span>
                </div>
                <div>
                  <span className="text-su-muted">Visible: </span>
                  <span
                    className={
                      satellite.isVisible
                        ? "text-signal-green"
                        : "text-su-muted"
                    }
                  >
                    {satellite.isVisible ? "Above horizon" : "Below horizon"}
                  </span>
                </div>
              </div>
            </Section>

            {/* Transponders */}
            {transponder && transponder.transponders.length > 0 && (
              <Section title="Transponders">
                <div className="space-y-2">
                  {transponder.transponders.map((tx, idx) => (
                    <div
                      key={idx}
                      className="bg-su-line/10 rounded-lg px-2.5 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-su-text font-medium">
                          {tx.name}
                        </span>
                        <span className="text-su-muted uppercase text-[10px]">
                          {tx.mode}
                          {tx.inverted ? " inv" : ""}
                        </span>
                      </div>
                      <div className="flex gap-3 font-mono text-su-muted">
                        {tx.uplinkRangeHz[0] > 0 && (
                          <span>
                            UP {formatFreqMHz(tx.uplinkRangeHz[0])}
                            {tx.uplinkRangeHz[1] !== tx.uplinkRangeHz[0] &&
                              ` - ${formatFreqMHz(tx.uplinkRangeHz[1])}`}
                          </span>
                        )}
                        {tx.downlinkRangeHz[0] > 0 && (
                          <span>
                            DN {formatFreqMHz(tx.downlinkRangeHz[0])}
                            {tx.downlinkRangeHz[1] !== tx.downlinkRangeHz[0] &&
                              ` - ${formatFreqMHz(tx.downlinkRangeHz[1])}`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {transponder.beaconHz && (
                  <p className="text-xs text-su-muted mt-2 font-mono">
                    Beacon: {formatFreqMHz(transponder.beaconHz)}
                  </p>
                )}
                {transponder.notes && (
                  <p className="text-xs text-su-muted mt-1.5 italic">
                    {transponder.notes}
                  </p>
                )}
              </Section>
            )}

            {/* Live Frequency Data (SatNOGS) */}
            {satnogsLoading && (
              <Section title="Live Frequency Data (SatNOGS)">
                <MiniSpinner />
              </Section>
            )}
            {!satnogsLoading && satnogsTransmitters.length > 0 && (
              <Section title="Live Frequency Data (SatNOGS)">
                <div className="space-y-2">
                  {satnogsTransmitters.map((tx) => (
                    <SatNOGSTransmitterRow key={tx.uuid} tx={tx} />
                  ))}
                </div>
                <p className="text-[10px] text-su-muted mt-2">
                  Data from SatNOGS DB
                </p>
              </Section>
            )}

            {/* Community Status (AMSAT) */}
            {!amsatLoading && amsatStatus && amsatStatus.reportCount > 0 && (
              <Section title="Community Status (AMSAT)">
                <div className="text-xs space-y-1.5">
                  {/* Overall status + report count */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${AMSAT_STATUS_STYLES[amsatStatus.status].dot}`}
                    />
                    <span className="text-su-muted font-medium">
                      {AMSAT_STATUS_STYLES[amsatStatus.status].label}
                    </span>
                    <span className="text-su-muted">·</span>
                    <span className="text-su-muted">
                      {amsatStatus.reportCount} report
                      {amsatStatus.reportCount !== 1 ? "s" : ""} in last 24h
                    </span>
                  </div>
                  {/* Latest report */}
                  {amsatStatus.latestReport && (
                    <div className="text-su-muted pl-4">
                      <span className="text-su-muted font-medium">
                        {amsatStatus.latestReport.callsign}
                      </span>
                      {amsatStatus.latestReport.grid_square && (
                        <span>
                          {" "}
                          from{" "}
                          <span className="text-su-muted font-mono">
                            {amsatStatus.latestReport.grid_square}
                          </span>
                        </span>
                      )}
                      {amsatStatus.latestReport.report && (
                        <span>
                          {" "}
                          &mdash; &ldquo;
                          <span className="text-su-muted italic">
                            {amsatStatus.latestReport.report}
                          </span>
                          &rdquo;
                        </span>
                      )}
                      {amsatStatus.latestReport.reported_time && (
                        <span>
                          {" "}
                          ·{" "}
                          {formatDistanceToNow(
                            new Date(amsatStatus.latestReport.reported_time),
                            { addSuffix: true },
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Next Pass */}
            {nextPass && (
              <Section title="Next Pass">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="col-span-2">
                    <span className="text-su-muted">AOS: </span>
                    <span className="text-cosmic-cyan font-medium">
                      {formatPassTime(nextPass)}
                    </span>
                    <span className="text-su-muted mx-1.5">·</span>
                    <span className="text-su-muted font-mono">
                      {formatAzimuth(nextPass.aosAz)}
                    </span>
                  </div>
                  <div>
                    <span className="text-su-muted">Max El: </span>
                    <span className="text-su-muted font-mono">
                      {Math.round(nextPass.maxEl)}&deg;
                    </span>
                  </div>
                  <div>
                    <span className="text-su-muted">LOS Az: </span>
                    <span className="text-su-muted font-mono">
                      {formatAzimuth(nextPass.losAz)}
                    </span>
                  </div>
                </div>
              </Section>
            )}

            {/* Orbit Info */}
            <Section title="Orbit Info">
              <div className="text-xs text-su-muted space-y-1">
                <div>
                  <span className="text-su-muted">Category: </span>
                  <span>{catMeta.label}</span>
                  <span className="mx-2 text-su-muted">·</span>
                  <span className="text-su-muted">TLE: </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${tleAgeBadge.className}`}
                  >
                    {tleAgeBadge.label}
                  </span>
                </div>
                {satellite.isCustom && (
                  <div>
                    <span className="text-su-muted">Source: </span>
                    <span className="text-aurora-purple">Custom TLE</span>
                  </div>
                )}
                {description?.orbitType && (
                  <div>
                    <span className="text-su-muted">Orbit Type: </span>
                    <span className="text-su-muted">
                      {description.orbitType}
                    </span>
                  </div>
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
