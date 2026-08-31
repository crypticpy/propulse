/**
 * Full spot details opened from a row in the stacked-spot popover.
 *
 * AccessibleDialog supplies the modal behavior as well as the visual shell:
 * focus moves into the dialog, remains trapped there, the background becomes
 * inert, scrolling locks, and focus returns to the invoking control on close.
 * Its capture-phase Escape handling also prevents the same keypress from
 * exiting fullscreen/observatory mode behind this dialog.
 */

import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import type { LiveSpot } from "@/types/livespot";
import { SPOT_SOURCE_COLORS } from "@/types/livespot";
import { getModeColor } from "@/lib/utils/spotColors";
import {
  formatSpotAge,
  getAgeBadgeColors,
  getSpotAgeInfo,
} from "./LiveSpotArcs";

interface SpotDetailsModalProps {
  spot: LiveSpot | null;
  onClose: () => void;
}

function formatFrequency(freqKHz: number): string {
  if (freqKHz >= 1000) {
    return `${(freqKHz / 1000).toFixed(3)} MHz`;
  }
  return `${freqKHz.toFixed(1)} kHz`;
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude
    ? value >= 0
      ? "N"
      : "S"
    : value >= 0
      ? "E"
      : "W";
  return `${Math.abs(value).toFixed(2)}\u00B0 ${direction}`;
}

function formatUtc(date: Date): string {
  return `${date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 break-words font-mono text-sm text-gray-200">
        {value}
      </div>
    </div>
  );
}

export function SpotDetailsModal({ spot, onClose }: SpotDetailsModalProps) {
  if (!spot) return null;

  const spotTime =
    spot.time instanceof Date ? spot.time : new Date(spot.time);
  const modeColor = getModeColor(spot.mode);
  const sourceColors = SPOT_SOURCE_COLORS[spot.source];
  const ageColors = getAgeBadgeColors(getSpotAgeInfo(spotTime).ageCategory);
  const hasDxCoordinates =
    Number.isFinite(spot.dxLat) && Number.isFinite(spot.dxLon);
  const hasSpotterCoordinates =
    Number.isFinite(spot.spotterLat) && Number.isFinite(spot.spotterLon);

  return (
    <AccessibleDialog
      open
      onClose={onClose}
      title={`Spot details for ${spot.dx}`}
      description={formatFrequency(spot.frequency)}
      size="md"
    >
      <div
        className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
        style={{ borderTopColor: modeColor, borderTopWidth: 3 }}
      >
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          {spot.mode && (
            <span
              className="rounded px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: modeColor }}
            >
              {spot.mode}
            </span>
          )}
          {spot.band && (
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-300">
              {spot.band}
            </span>
          )}
        </div>

        <div className="border-y border-white/10 bg-white/[0.025] px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded px-2 py-1 text-[10px] font-medium"
              style={{
                backgroundColor: sourceColors.bgColor,
                color: sourceColors.color,
              }}
            >
              {spot.source}
            </span>
            <span
              className={`rounded border px-2 py-1 text-[10px] font-medium ${ageColors.bg} ${ageColors.text} ${ageColors.border}`}
            >
              {formatSpotAge(spotTime)}
            </span>
            <span className="text-xs text-gray-400">{formatUtc(spotTime)}</span>
          </div>
        </div>

        <div className="grid gap-2 px-5 py-4 sm:grid-cols-2">
          <DetailItem label="DX grid" value={spot.dxGrid || "Not reported"} />
          <DetailItem
            label="DX location"
            value={
              hasDxCoordinates
                ? `${formatCoordinate(spot.dxLat!, true)}, ${formatCoordinate(spot.dxLon!, false)}${spot.dxLocApprox ? " (approx.)" : ""}`
                : "Not reported"
            }
          />
          <DetailItem label="Spotted by" value={spot.spotter || "Unknown"} />
          <DetailItem
            label="Spotter grid"
            value={spot.spotterGrid || spot.receiverGrid || "Not reported"}
          />
          {hasSpotterCoordinates && (
            <DetailItem
              label="Spotter location"
              value={`${formatCoordinate(spot.spotterLat!, true)}, ${formatCoordinate(spot.spotterLon!, false)}${spot.spotterLocApprox ? " (approx.)" : ""}`}
            />
          )}
          {spot.receiverCallsign && (
            <DetailItem label="Receiver" value={spot.receiverCallsign} />
          )}
          {spot.snr !== undefined && (
            <DetailItem label="Signal-to-noise" value={`${spot.snr} dB`} />
          )}
          {spot.wpm !== undefined && (
            <DetailItem label="CW speed" value={`${spot.wpm} WPM`} />
          )}
        </div>

        {spot.comment && (
          <div className="mx-5 mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Spot comment
            </div>
            <p className="mt-1 text-sm leading-relaxed text-gray-300">
              {spot.comment}
            </p>
          </div>
        )}

        <div className="flex justify-end border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

SpotDetailsModal.displayName = "SpotDetailsModal";
