/**
 * SatelliteDetailModal — Centered modal for satellite detail view
 *
 * Opens when `satelliteModalId` is set in mapStore (independent of the
 * follower popup's `selectedSatelliteId`). Shows satellite position data,
 * transponder info with Doppler correction, and pass predictions. Rendered
 * through `AccessibleDialog`, which portals to document.body itself.
 */

import { useMemo, useCallback, useId } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useMapStore } from "@/stores/mapStore";
import { useSatellites } from "@/hooks/useSatellites";
import { useSatelliteTransponders } from "@/hooks/useSatelliteTransponders";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { useUserStore } from "@/stores/userStore";
import { SatelliteTuneButton } from "@/components/radio/SatelliteTuneButton";
import {
  getTransponder,
  type SatelliteTransponder,
  type Transponder,
} from "@/lib/data/satelliteTransponders";
import {
  getCorrectedFrequencies,
  type CorrectedFrequencies,
} from "@/lib/utils/doppler";
import { computePassQuality } from "@/lib/utils/passQuality";
import {
  computeLinkBudget,
  computeSlantRange,
  computeSquintAngle,
  type LinkBudgetResult,
} from "@/lib/utils/linkBudget";
import { calculatePosition } from "@/lib/api/satellites";
import {
  CATEGORY_META,
  formatAzimuth,
  formatFreqMHz,
  formatShift,
  formatLatLon,
} from "@/lib/utils/satellite";
import { SatelliteLogButton } from "./SatelliteLogButton";
import type {
  SatelliteCategory,
  SatelliteInfo,
  SatNOGSTransmitter,
  PassPrediction,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Inline micro-components
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: SatelliteCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${meta.color} ${meta.bg}`}
    >
      {meta.label}
    </span>
  );
}

function VisibilityDot({ isVisible }: { isVisible: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        isVisible ? "bg-green-400 animate-pulse" : "bg-su-line"
      }`}
      title={isVisible ? "Above horizon" : "Below horizon"}
    />
  );
}

// ---------------------------------------------------------------------------
// Quality & Link Budget Helpers
// ---------------------------------------------------------------------------

function qualityColor(score: number): string {
  if (score >= 4) return "text-green-400";
  if (score === 3) return "text-yellow-400";
  if (score === 2) return "text-orange-400";
  return "text-red-400";
}

function StarRating({ score }: { score: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span
      className={`text-[10px] ${qualityColor(score)}`}
      aria-label={`${score} out of 5 stars`}
    >
      {"★".repeat(score)}
      {"☆".repeat(5 - score)}
    </span>
  );
}

const LINK_QUALITY_STYLE: Record<
  LinkBudgetResult["quality"],
  { label: string; classes: string }
> = {
  good: {
    label: "Good",
    classes: "bg-green-400/15 text-green-400 border-green-400/30",
  },
  marginal: {
    label: "Marginal",
    classes: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
  },
  unlikely: {
    label: "Unlikely",
    classes: "bg-red-400/15 text-red-400 border-red-400/30",
  },
};

/** Single SatNOGS transponder row */
function SatNOGSTransponderRow({ tx }: { tx: SatNOGSTransmitter }) {
  return (
    <div className="bg-su-line/10 rounded-md px-2.5 py-2 mb-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-su-muted truncate">
          {tx.description}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className={`text-[8px] px-1 py-0.5 rounded font-semibold uppercase ${
              tx.status === "active"
                ? "bg-green-400/20 text-green-400"
                : "bg-su-line/20 text-su-muted"
            }`}
          >
            {tx.status}
          </span>
          {tx.mode && (
            <span className="text-[9px] px-1 py-0.5 rounded uppercase font-semibold bg-cyan-400/20 text-cyan-400">
              {tx.mode}
              {tx.invert ? " INV" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-mono">
        {(tx.uplink_low || tx.uplink_high) && (
          <div>
            <span className="text-su-muted">UP: </span>
            <span className="text-su-muted">
              {tx.uplink_low ? formatFreqMHz(tx.uplink_low) : "\u2014"}
              {tx.uplink_high &&
                tx.uplink_low !== tx.uplink_high &&
                ` - ${formatFreqMHz(tx.uplink_high)}`}
            </span>
          </div>
        )}
        {(tx.downlink_low || tx.downlink_high) && (
          <div>
            <span className="text-su-muted">DN: </span>
            <span className="text-su-muted">
              {tx.downlink_low ? formatFreqMHz(tx.downlink_low) : "\u2014"}
              {tx.downlink_high &&
                tx.downlink_low !== tx.downlink_high &&
                ` - ${formatFreqMHz(tx.downlink_high)}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TransponderInfo (self-contained copy from SatellitePanel)
// ---------------------------------------------------------------------------

function TransponderInfo({
  satellite,
  transponderData,
  satnogsTransponders,
}: {
  satellite: SatelliteInfo;
  transponderData: SatelliteTransponder;
  satnogsTransponders?: SatNOGSTransmitter[];
}) {
  const { station } = useUserStore();

  const useSatNOGS = satnogsTransponders && satnogsTransponders.length > 0;

  const dopplerInfo = useMemo((): CorrectedFrequencies | null => {
    if (!station || !satellite.isVisible) return null;
    const xpdr = transponderData.transponders[0];
    if (!xpdr) return null;

    const now = new Date();
    const prevTime = new Date(now.getTime() - 1000);
    const prevPos = calculatePosition(satellite, prevTime);
    if (!prevPos) return null;

    try {
      return getCorrectedFrequencies(
        satellite.position,
        prevPos,
        { lat: station.lat, lon: station.lon, alt: 0 },
        xpdr,
        1,
      );
    } catch {
      return null;
    }
  }, [satellite, station, transponderData]);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-su-muted uppercase tracking-wider font-semibold">
          Transponders
        </span>
        {useSatNOGS && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-medium">
            SatNOGS
          </span>
        )}
      </div>

      {/* Prefer SatNOGS live data when available, fallback to static */}
      {useSatNOGS
        ? satnogsTransponders.map((tx) => (
            <SatNOGSTransponderRow key={tx.uuid} tx={tx} />
          ))
        : transponderData.transponders.map((xpdr: Transponder, idx: number) => (
            <div
              key={idx}
              className="bg-su-line/10 rounded-md px-2.5 py-2 mb-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-su-muted">
                  {xpdr.name}
                </span>
                <span
                  className={`text-[9px] px-1 py-0.5 rounded uppercase font-semibold ${
                    xpdr.mode === "FM"
                      ? "bg-green-400/20 text-green-400"
                      : xpdr.mode === "linear"
                        ? "bg-cyan-400/20 text-cyan-400"
                        : "bg-orange-400/20 text-orange-400"
                  }`}
                >
                  {xpdr.mode}
                  {xpdr.inverted ? " INV" : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-mono">
                <div>
                  <span className="text-su-muted">UP: </span>
                  <span className="text-su-muted">
                    {formatFreqMHz(xpdr.uplinkRangeHz[0])}
                    {xpdr.uplinkRangeHz[0] !== xpdr.uplinkRangeHz[1] &&
                      ` - ${formatFreqMHz(xpdr.uplinkRangeHz[1])}`}
                  </span>
                </div>
                <div>
                  <span className="text-su-muted">DN: </span>
                  <span className="text-su-muted">
                    {formatFreqMHz(xpdr.downlinkRangeHz[0])}
                    {xpdr.downlinkRangeHz[0] !== xpdr.downlinkRangeHz[1] &&
                      ` - ${formatFreqMHz(xpdr.downlinkRangeHz[1])}`}
                  </span>
                </div>
              </div>
            </div>
          ))}

      {transponderData.beaconHz && (
        <div className="text-[10px] font-mono text-su-muted mt-1">
          Beacon: {formatFreqMHz(transponderData.beaconHz)}
        </div>
      )}

      {transponderData.notes && (
        <div className="text-[10px] text-su-muted mt-1 italic">
          {transponderData.notes}
        </div>
      )}

      {/* Real-time Doppler correction (visible pass only) */}
      {dopplerInfo && (
        <div className="mt-2 bg-cyan-400/5 border border-cyan-400/20 rounded-md px-2.5 py-2">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-1 font-semibold">
            Doppler-Corrected
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
            <div>
              <span className="text-su-muted">TX: </span>
              <span className="text-su-text">
                {formatFreqMHz(dopplerInfo.uplinkHz)}
              </span>
              <div className="text-su-muted">
                {formatShift(dopplerInfo.uplinkShiftHz)}
              </div>
            </div>
            <div>
              <span className="text-su-muted">RX: </span>
              <span className="text-su-text">
                {formatFreqMHz(dopplerInfo.downlinkHz)}
              </span>
              <div className="text-su-muted">
                {formatShift(dopplerInfo.downlinkShiftHz)}
              </div>
            </div>
          </div>

          <SatelliteTuneButton
            downlinkHz={dopplerInfo.downlinkHz}
            mode={transponderData.transponders[0]?.mode}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PassRow (self-contained copy from SatellitePanel)
// ---------------------------------------------------------------------------

function PassRow({ pass }: { pass: PassPrediction }) {
  const { use24h } = useTimeFormat();
  const isActive = pass.aos <= new Date() && pass.los >= new Date();
  const isFuture = pass.aos > new Date();
  const timeFmt = use24h ? "HH:mm" : "h:mm a";
  const quality = computePassQuality(pass);

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
        isActive
          ? "bg-green-400/10 border border-green-400/20"
          : "bg-su-line/10"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
          <span className="font-mono text-su-muted">
            {isActive ? "NOW" : format(pass.aos, timeFmt)}
          </span>
          <span className="text-su-muted">-</span>
          <span className="font-mono text-su-muted">
            {format(pass.los, timeFmt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StarRating score={quality.score} />
          <span
            className={`text-[9px] px-1 py-0.5 rounded font-medium ${qualityColor(quality.score)} ${
              quality.score >= 4
                ? "bg-green-400/10"
                : quality.score === 3
                  ? "bg-yellow-400/10"
                  : quality.score === 2
                    ? "bg-orange-400/10"
                    : "bg-red-400/10"
            }`}
          >
            {quality.label}
          </span>
          {isFuture && (
            <span className="text-[10px] text-su-muted">
              in {formatDistanceToNow(pass.aos)}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-su-muted">
          {Math.round(pass.maxEl)}&deg; max
        </div>
        <div className="text-[10px] text-su-muted mt-0.5">
          {formatAzimuth(pass.aosAz)} &rarr; {formatAzimuth(pass.losAz)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SatelliteDetailContent
// ---------------------------------------------------------------------------

function SatelliteDetailContent({
  satellite,
  passes,
  onClose,
  titleId,
}: {
  satellite: SatelliteInfo;
  passes: PassPrediction[];
  onClose: () => void;
  titleId: string;
}) {
  const { lat, lon, alt, velocity } = satellite.position;
  const { station } = useUserStore();

  const transponderData = useMemo(
    () => getTransponder(satellite.name, satellite.noradId),
    [satellite.name, satellite.noradId],
  );

  // Fetch live SatNOGS transponder data
  const { transponders: satnogsXpdrs } = useSatelliteTransponders(
    satellite.noradId,
  );

  // Primary transponder for log button props
  const primaryXpdr = transponderData?.transponders[0];
  const activePass = passes.find(
    (p) => p.aos <= new Date() && p.los >= new Date(),
  );

  // Link budget calculation (when satellite is visible and we have transponder + station)
  const linkBudget = useMemo((): LinkBudgetResult | null => {
    if (!satellite.isVisible || !station || !primaryXpdr) return null;

    const downlinkMHz = primaryXpdr.downlinkRangeHz[0] / 1_000_000;
    if (downlinkMHz <= 0) return null;

    try {
      const slantRange = computeSlantRange(
        lat,
        lon,
        alt,
        station.lat,
        station.lon,
      );

      // Typical amateur LEO sat: ~5 dBW EIRP, observer: 6 dBi Yagi, noise floor: -135 dBm
      const budget = computeLinkBudget(5, slantRange, downlinkMHz, 6, -135);

      // Compute squint angle separately
      const squint = computeSquintAngle(
        { lat, lon, altitude: alt },
        { lat: station.lat, lon: station.lon },
        0,
      );

      return {
        ...budget,
        squintAngleDeg: squint,
      };
    } catch {
      return null;
    }
  }, [satellite.isVisible, station, primaryXpdr, lat, lon, alt]);

  return (
    <div className="flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2
              id={titleId}
              className="text-sm font-medium text-su-text truncate"
            >
              {satellite.name}
            </h2>
            <CategoryBadge category={satellite.category} />
            <VisibilityDot isVisible={satellite.isVisible} />
          </div>
          <div className="text-[10px] text-su-muted font-mono mt-0.5">
            NORAD {satellite.noradId}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-su-line/20 rounded transition-colors flex-shrink-0"
          title="Close"
        >
          <svg
            className="w-4 h-4 text-su-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
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

      {/* Scrollable content */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {/* Position data grid */}
        <div
          className="grid gap-2 mb-3"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <div className="bg-su-line/10 rounded-md px-2.5 py-2">
            <div className="text-[10px] text-su-muted uppercase tracking-wider">
              Position
            </div>
            <div className="text-xs font-mono text-su-text mt-0.5">
              {formatLatLon(lat, lon)}
            </div>
          </div>
          <div className="bg-su-line/10 rounded-md px-2.5 py-2">
            <div className="text-[10px] text-su-muted uppercase tracking-wider">
              Altitude
            </div>
            <div className="text-xs font-mono text-su-text mt-0.5">
              {Math.round(alt)} km
            </div>
          </div>
          <div className="bg-su-line/10 rounded-md px-2.5 py-2">
            <div className="text-[10px] text-su-muted uppercase tracking-wider">
              Velocity
            </div>
            <div className="text-xs font-mono text-su-text mt-0.5">
              {velocity.toFixed(1)} km/s
            </div>
          </div>
          <div className="bg-su-line/10 rounded-md px-2.5 py-2">
            <div className="text-[10px] text-su-muted uppercase tracking-wider">
              Status
            </div>
            <div
              className={`text-xs font-mono mt-0.5 ${
                satellite.isVisible ? "text-green-400" : "text-su-muted"
              }`}
            >
              {satellite.isVisible ? "Visible" : "Below horizon"}
            </div>
          </div>
        </div>

        {/* Transponder & Doppler info */}
        {transponderData && (
          <TransponderInfo
            satellite={satellite}
            transponderData={transponderData}
            satnogsTransponders={
              satnogsXpdrs.length > 0 ? satnogsXpdrs : undefined
            }
          />
        )}

        {/* Link Budget Indicator */}
        {linkBudget && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-su-muted uppercase tracking-wider font-semibold">
                Signal
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                  LINK_QUALITY_STYLE[linkBudget.quality].classes
                }`}
              >
                {LINK_QUALITY_STYLE[linkBudget.quality].label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-su-muted">
              <span title="Free-space path loss">
                FSPL: {linkBudget.freeSpacePathLossDb.toFixed(1)} dB
              </span>
              <span title="Squint angle from nadir">
                Squint: {linkBudget.squintAngleDeg.toFixed(1)}&deg;
              </span>
              <span title="Estimated link margin">
                Margin: {linkBudget.estimatedMarginDb.toFixed(1)} dB
              </span>
            </div>
          </div>
        )}

        {/* Log This Pass button */}
        <div className="mt-2">
          <SatelliteLogButton
            satelliteName={satellite.name}
            transponderMode={primaryXpdr?.mode}
            downlinkFrequencyHz={primaryXpdr?.downlinkRangeHz[0]}
            passStartTime={activePass?.aos}
            isAboveHorizon={satellite.isVisible}
          />
        </div>

        {/* Pass predictions */}
        <div className="mt-3">
          <div className="text-[10px] text-su-muted uppercase tracking-wider mb-1.5 font-semibold">
            Next Passes (24h)
          </div>
          {passes.length === 0 ? (
            <div className="text-xs text-su-muted text-center py-3">
              No passes predicted &mdash; set your QTH in settings
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {passes.slice(0, 8).map((pass, idx) => (
                <PassRow key={idx} pass={pass} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal Component
// ---------------------------------------------------------------------------

export default function SatelliteDetailModal() {
  // Reading only `satelliteModalId` here (instead of also calling
  // useSatellites unconditionally) keeps the expensive TLE query, position
  // timer and satellite-list useMemo in `SatelliteDetailModalInner` out of
  // every PropSphere render — they only run while a satellite modal is
  // actually open. See #805.
  const satelliteModalId = useMapStore((s) => s.satelliteModalId);

  if (satelliteModalId === null) return null;

  return <SatelliteDetailModalInner satelliteModalId={satelliteModalId} />;
}

function SatelliteDetailModalInner({
  satelliteModalId,
}: {
  satelliteModalId: number;
}) {
  const setSatelliteModalId = useMapStore((s) => s.setSatelliteModalId);
  const { selectedSatellite, nextPasses } = useSatellites(
    true,
    satelliteModalId,
  );
  const titleId = useId();

  const handleClose = useCallback(() => {
    setSatelliteModalId(null);
  }, [setSatelliteModalId]);

  // AccessibleDialog supplies role="dialog", aria-modal, capture-phase
  // Escape (with stopImmediatePropagation), the backdrop button, background
  // inerting, scroll lock and initial focus. It must stay mounted for the
  // *entire* time satelliteModalId is non-null — including the window before
  // selectedSatellite resolves, or if it never resolves (the satellite was
  // dropped from the enabled groups, or its orbit can't be computed) — or
  // Escape falls through to useFullscreenEscape's bubble-phase handler
  // instead of being owned by this dialog, and the id is left stuck set for
  // the dialog to silently re-open on the next refetch. See #805 Codex
  // thread PRRT_kwDORFr4R86g3-Vc.
  if (!selectedSatellite) {
    return (
      <AccessibleDialog
        open
        onClose={handleClose}
        title="Satellite unavailable"
        chrome="bare"
        labelledBy={titleId}
        zIndexClassName="z-[300]"
        panelProps={{
          className:
            "w-full max-w-md bg-su-canvas border border-su-line/40 rounded-xl shadow-2xl shadow-black/60 p-4",
        }}
      >
        <h2 id={titleId} className="text-sm font-medium text-su-text">
          Satellite unavailable
        </h2>
        <p className="text-xs text-su-muted mt-2">
          Satellite data is not available right now. It may have been
          removed from the enabled groups or its orbit could not be
          computed.
        </p>
        <button
          onClick={handleClose}
          className="mt-3 px-3 py-1.5 text-xs font-medium bg-su-line/10 hover:bg-su-line/20 text-su-text rounded-lg transition-colors"
        >
          Close
        </button>
      </AccessibleDialog>
    );
  }

  return (
    <AccessibleDialog
      open
      onClose={handleClose}
      title={selectedSatellite.name}
      chrome="bare"
      labelledBy={titleId}
      zIndexClassName="z-[300]"
      panelProps={{
        className:
          "w-full max-w-md bg-su-canvas border border-su-line/40 rounded-xl shadow-2xl shadow-black/60 p-4",
      }}
    >
      <SatelliteDetailContent
        satellite={selectedSatellite}
        passes={nextPasses}
        onClose={handleClose}
        titleId={titleId}
      />
    </AccessibleDialog>
  );
}
