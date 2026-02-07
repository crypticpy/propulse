/**
 * MobileDXWizard Component
 *
 * Step-based mobile flow replacing the desktop 2-column DXWizard layout.
 * Step 1: Target input, mode picker, radio selection, power ceiling, analyze button.
 * Step 2: Best band recommendation card, per-band expandable cards, mode tips.
 *
 * All data and callbacks are passed as props from the parent DXWizard page.
 */

import { useState } from "react";
import { DataFreshnessIndicator } from "@/components/ui";
import { getPathStatusColor } from "@/lib/utils/bands";
import type { PathBandCondition } from "@/lib/utils/bands";
import type { RadioEquipment } from "@/types/radio";
import type { LicenseClass } from "@/types/bandplan";
import type { ITURegion } from "@/types/bandplan";

type WizardMode = "SSB" | "CW" | "FT8";

interface ResolvedTarget {
  label: string;
  grid: string;
  lat: number;
  lon: number;
  source: "grid" | "coords" | "geocode" | "callsign";
  callsign?: string;
}

interface BandCandidate extends PathBandCondition {
  requiredWatts: number;
  ceilingWatts: number;
  withinCeiling: boolean;
  freqsKHz: number[];
  legalMaxWatts: number | null;
}

interface Recommendation {
  type: "ok" | "none";
  best?: BandCandidate;
  bands: PathBandCondition[];
  antennaGainDbi: number;
}

export interface MobileDXWizardProps {
  // Target input state
  targetQuery: string;
  onTargetQueryChange: (query: string) => void;
  resolvedTarget: ResolvedTarget | null;
  isResolving: boolean;
  onResolveTarget: () => void;
  targetError: string | null;

  // Callsign lookup
  callsignInput: string;
  onCallsignInputChange: (value: string) => void;
  onLookupCallsign: () => void;
  callsignLoading: boolean;
  callsignError: string | null;

  // Mode/power state
  mode: WizardMode;
  onModeChange: (mode: WizardMode) => void;
  txPowerCeilingWatts: number;
  onPowerChange: (watts: number) => void;
  effectiveMaxPower: number;

  // License / region
  licenseClass: LicenseClass;
  onLicenseClassChange: (lc: LicenseClass) => void;
  ituRegion: ITURegion;
  onItuRegionChange: (r: ITURegion) => void;

  // Station
  station: { callsign: string; grid: string; lat: number; lon: number } | null;

  // Results
  recommendation: Recommendation | null;
  tips: Array<{ label: string; value: string }>;

  // Radio
  selectedRadio: RadioEquipment | null;
  onShowRadioPicker: () => void;
  radioLabel: string;

  // Solar
  currentKp: number;
  currentSfi: number;
  kIndexError: boolean;
  solarFluxError: boolean;

  // Data freshness
  dataUpdatedAt: number | undefined;
  isRefetching: boolean;
  onRefresh: () => void;
}

function formatKHz(khz: number): string {
  if (khz >= 1000) {
    return `${(khz / 1000).toFixed(3)} MHz`;
  }
  return `${khz} kHz`;
}

export function MobileDXWizard(props: MobileDXWizardProps) {
  const [showResults, setShowResults] = useState(false);
  const [expandedBand, setExpandedBand] = useState<string | null>(null);

  const handleAnalyze = () => {
    if (props.resolvedTarget) {
      setShowResults(true);
    }
  };

  // Results view
  if (showResults && props.recommendation) {
    if (props.recommendation.type === "none") {
      return (
        <div className="p-4 space-y-3">
          <button
            onClick={() => setShowResults(false)}
            className="text-sm text-gray-400 flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Change target
          </button>

          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <div className="text-alert-red font-semibold mb-1">
              No viable band/mode options
            </div>
            <div className="text-sm text-gray-300">
              Try FT8, reduce constraints, or wait for improved conditions.
            </div>
          </div>
        </div>
      );
    }

    if (props.recommendation.type === "ok" && props.recommendation.best) {
      const best = props.recommendation.best;
      const allBands = props.recommendation.bands;

      return (
        <div className="p-4 space-y-3 pb-20">
          {/* Back button */}
          <button
            onClick={() => setShowResults(false)}
            className="text-sm text-gray-400 flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Change target
          </button>

          {/* Resolved target summary */}
          {props.resolvedTarget && (
            <div className="text-xs text-gray-400 font-mono">
              {props.resolvedTarget.label} ({props.resolvedTarget.grid})
            </div>
          )}

          {/* Best band card */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              Best Band
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div
                  className={`text-3xl font-orbitron font-bold ${getPathStatusColor(best.status)}`}
                >
                  {best.band}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {best.frequency}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-mono font-bold text-plasma-orange">
                  {best.requiredWatts}W
                </div>
                <div className="text-[10px] text-gray-400">
                  Ceiling: {best.ceilingWatts}W
                  {!best.withinCeiling && (
                    <span className="text-alert-red ml-1">exceeds</span>
                  )}
                </div>
              </div>
            </div>

            {/* Target frequency */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div>
                <div className="text-[10px] text-gray-400 uppercase">
                  Frequency
                </div>
                <div className="text-sm font-mono font-bold text-white">
                  {formatKHz(best.freqsKHz[0])}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase">Mode</div>
                <div className="text-sm font-mono font-bold text-white">
                  {props.mode}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase">
                  SNR @100W
                </div>
                <div className="text-sm font-mono font-bold text-white">
                  {best.snrEstimate} dB
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="text-xs text-gray-300 pt-2 border-t border-white/10">
              {best.notes}
            </div>
          </div>

          {/* Mode tips card */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <div className="text-xs font-semibold text-white mb-2">
              DX Tips ({props.mode})
            </div>
            <div className="space-y-1.5">
              {props.tips.map((t) => (
                <div key={t.label} className="text-xs">
                  <span className="text-gray-400 font-semibold">
                    {t.label}:
                  </span>{" "}
                  <span className="text-gray-300">{t.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* All bands list */}
          <div className="space-y-2">
            <div className="text-xs text-gray-400 uppercase tracking-wide px-1">
              All Bands
            </div>
            {allBands.map((band) => {
              const isExpanded = expandedBand === band.band;
              return (
                <button
                  key={band.band}
                  type="button"
                  onClick={() => setExpandedBand(isExpanded ? null : band.band)}
                  className="w-full text-left bg-white/[0.03] border border-white/10 rounded-xl p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono font-bold text-sm ${getPathStatusColor(band.status)}`}
                      >
                        {band.band}
                      </span>
                      <span className="text-xs text-gray-500">
                        {band.frequency}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 capitalize">
                        {band.status}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-300 space-y-1">
                      <div>
                        SNR @100W:{" "}
                        <span className="font-mono text-white">
                          {band.snrEstimate} dB
                        </span>
                      </div>
                      {band.pathLoss !== undefined && (
                        <div>
                          Path loss:{" "}
                          <span className="font-mono text-white">
                            {Math.round(band.pathLoss)} dB
                          </span>
                        </div>
                      )}
                      <div className="text-gray-400">{band.notes}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Solar indices */}
          <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500 font-mono pt-2">
            <span>Kp={props.currentKp}</span>
            <span>SFI={props.currentSfi}</span>
            {(props.kIndexError || props.solarFluxError) && (
              <span className="text-caution-amber">Solar data issue</span>
            )}
          </div>
        </div>
      );
    }
  }

  // Input view (Step 1)
  return (
    <div className="p-4 space-y-4 pb-20">
      <DataFreshnessIndicator
        dataUpdatedAt={props.dataUpdatedAt}
        onRefresh={props.onRefresh}
        isRefetching={props.isRefetching}
      />

      {/* Station not set warning */}
      {!props.station && (
        <div className="bg-alert-red/10 border border-alert-red/30 rounded-2xl p-4">
          <div className="text-white font-semibold text-sm mb-1">
            Station not set
          </div>
          <div className="text-xs text-gray-300">
            Set your callsign and grid square in Settings to enable path
            calculations.
          </div>
        </div>
      )}

      {/* Target input */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Target</h3>
        <div className="space-y-2">
          <input
            value={props.targetQuery}
            onChange={(e) => props.onTargetQueryChange(e.target.value)}
            placeholder="Grid, coords, or location"
            className="w-full px-3 py-2.5 bg-deep-space/70 border border-white/10 rounded-xl
                       text-white placeholder-gray-500 text-sm
                       focus:outline-none focus:border-plasma-orange/50"
          />
          <button
            type="button"
            onClick={props.onResolveTarget}
            disabled={props.isResolving}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl
                       text-gray-200 text-sm font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {props.isResolving ? "Resolving..." : "Resolve Location"}
          </button>
          {props.targetError && (
            <div className="text-xs text-alert-red">{props.targetError}</div>
          )}
        </div>

        {/* Callsign lookup */}
        <div className="pt-2 border-t border-white/10">
          <div className="text-xs text-gray-400 mb-2">Callsign lookup</div>
          <div className="flex gap-2">
            <input
              value={props.callsignInput}
              onChange={(e) => props.onCallsignInputChange(e.target.value)}
              placeholder="e.g., W1AW"
              className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-xl
                         text-white placeholder-gray-500 font-mono text-sm
                         focus:outline-none focus:border-plasma-orange/50"
            />
            <button
              type="button"
              onClick={props.onLookupCallsign}
              disabled={props.callsignLoading}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl
                         text-gray-200 text-sm font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {props.callsignLoading ? "..." : "Lookup"}
            </button>
          </div>
          {props.callsignError && (
            <div className="text-xs text-alert-red mt-1">
              {props.callsignError}
            </div>
          )}
        </div>

        {/* Resolved target display */}
        {props.resolvedTarget && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-gray-400">Resolved target</div>
            <div className="text-white font-semibold text-sm truncate">
              {props.resolvedTarget.label}
            </div>
            <div className="text-xs text-gray-300 font-mono mt-0.5">
              {props.resolvedTarget.grid} &bull;{" "}
              {props.resolvedTarget.lat.toFixed(3)}&deg;,{" "}
              {props.resolvedTarget.lon.toFixed(3)}&deg;
            </div>
          </div>
        )}
      </div>

      {/* Mode picker */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Mode</h3>
        <div className="flex gap-2">
          {(["FT8", "CW", "SSB"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => props.onModeChange(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                props.mode === m
                  ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30"
                  : "bg-white/[0.03] text-gray-400 border border-white/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Radio & Power */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Equipment</h3>

        {/* Radio selection */}
        <button
          type="button"
          onClick={props.onShowRadioPicker}
          className="w-full px-3 py-2.5 bg-deep-space/70 border border-white/10 rounded-xl
                     text-left text-white text-sm
                     focus:outline-none focus:border-plasma-orange/50 transition-colors"
        >
          {props.radioLabel || "Select a radio..."}
        </button>

        {/* Power ceiling */}
        <div>
          <label className="block text-xs text-gray-300 mb-1">
            TX power ceiling
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={props.effectiveMaxPower}
              value={props.txPowerCeilingWatts}
              onChange={(e) => props.onPowerChange(Number(e.target.value))}
              className="flex-1"
            />
            <div className="w-16 text-right font-mono text-sm text-white">
              {props.txPowerCeilingWatts}W
            </div>
          </div>
        </div>
      </div>

      {/* Solar indices */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-500 font-mono">
        <span>Kp={props.currentKp}</span>
        <span>SFI={props.currentSfi}</span>
        {(props.kIndexError || props.solarFluxError) && (
          <span className="text-caution-amber">Solar data issue</span>
        )}
      </div>

      {/* Analyze button */}
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={!props.resolvedTarget || !props.station}
        className="w-full py-3.5 rounded-xl bg-plasma-orange/20 text-plasma-orange
                   font-semibold text-base border border-plasma-orange/30
                   disabled:opacity-30 disabled:cursor-not-allowed
                   active:bg-plasma-orange/30 transition-colors"
      >
        Analyze Path
      </button>
    </div>
  );
}
