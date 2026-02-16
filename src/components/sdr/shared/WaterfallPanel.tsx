/**
 * WaterfallPanel -- SpectrumScope + Waterfall / BandScope display.
 * Shared between Classic and Flexible skins.
 */

import { Card } from "@/components/ui";
import { BandScope } from "@/components/sdr/BandScope";
import { SpectrumScope } from "@/components/sdr/SpectrumScope";
import { Waterfall } from "@/components/sdr/Waterfall";
import { formatHz } from "@/components/sdr/skins/types";
import type { FftFrame } from "@/components/sdr/skins/types";
import type { RadioState, ClusterSpotMessage } from "@/lib/radio/protocol";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";

export interface WaterfallPanelProps {
  effectiveState: RadioState | null;
  canStreamFft: boolean;
  fftEnabled: boolean;

  lastFftFrame: FftFrame | null;
  waterfallView: WaterfallView | null;
  tuningOverlay: TuningOverlay | null;
  waterfallOverlays: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;

  waterfallPalette: WaterfallPaletteName;
  waterfallMinDb: number;
  waterfallMaxDb: number;
  waterfallSpeed: number;
  spectrumPeakHold: boolean;
  spectrumGradientFill: boolean;
  spectrumBgColor: string;
  spectrumGridLines: number;
  spectrumVerticalGridLines: number;
  spectrumGridOpacity: number;
  spectrumSmoothing: number;
  spectrumLineColor: string;
  spectrumLineWidth: number;
  spectrumFillOpacity: number;
  spectrumLineShadow: boolean;
  spectrumLineShadowBlur: number;
  tuningLineColor?: string;
  tuningArrowColor?: string;
  notchFilters?: Array<{
    id: string;
    freqHz: number;
    q: number;
    enabled: boolean;
  }>;
  onFilterChange?: (low: number, high: number) => void;
  onAddNotch?: (freqHz: number, q: number) => void;
  onUpdateNotch?: (id: string, freqHz: number, q: number) => void;
  onRemoveNotch?: (id: string) => void;
  passbandBlendMode: string;
  passbandOpacity: number;

  waterfallInterpolation: "nearest" | "linear";
  waterfallGamma: number;
  waterfallRowHeight: number;

  clusterSpots: ClusterSpotMessage[];

  onWaterfallViewChange: (view: WaterfallView) => void;
  onPickFrequencyHz: (hz: number) => void;
  onSelectRangeHz: (range: { startHz: number; endHz: number }) => void;
}

export function WaterfallPanel({
  effectiveState,
  canStreamFft,
  fftEnabled,
  lastFftFrame,
  waterfallView,
  tuningOverlay,
  waterfallOverlays,
  waterfallPalette,
  waterfallMinDb,
  waterfallMaxDb,
  waterfallSpeed,
  spectrumPeakHold,
  spectrumGradientFill,
  spectrumBgColor,
  spectrumGridLines,
  spectrumVerticalGridLines,
  spectrumGridOpacity,
  spectrumSmoothing,
  spectrumLineColor,
  spectrumLineWidth,
  spectrumFillOpacity,
  spectrumLineShadow,
  spectrumLineShadowBlur,
  tuningLineColor,
  tuningArrowColor,
  notchFilters,
  onFilterChange,
  onAddNotch,
  onUpdateNotch,
  onRemoveNotch,
  passbandBlendMode,
  passbandOpacity,
  waterfallInterpolation,
  waterfallGamma,
  waterfallRowHeight,
  clusterSpots,
  onWaterfallViewChange,
  onPickFrequencyHz,
  onSelectRangeHz,
}: WaterfallPanelProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-200">
          {canStreamFft ? "Waterfall" : "Band Scope"}
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {effectiveState ? formatHz(effectiveState.freq) : "\u2014"}
        </div>
      </div>

      <div className="space-y-3">
        {canStreamFft && fftEnabled ? (
          <div className="h-[120px]">
            <SpectrumScope
              frame={lastFftFrame}
              view={waterfallView}
              palette={waterfallPalette}
              tuning={tuningOverlay}
              minDb={waterfallMinDb}
              maxDb={waterfallMaxDb}
              showPeakHold={spectrumPeakHold}
              showGradientFill={spectrumGradientFill}
              overlays={waterfallOverlays}
              bgColor={spectrumBgColor}
              gridLines={spectrumGridLines}
              verticalGridLines={spectrumVerticalGridLines}
              gridOpacity={spectrumGridOpacity}
              smoothing={spectrumSmoothing}
              lineColor={spectrumLineColor}
              lineWidth={spectrumLineWidth}
              fillOpacity={spectrumFillOpacity}
              lineShadow={spectrumLineShadow}
              lineShadowBlur={spectrumLineShadowBlur}
              tuningLineColor={tuningLineColor}
              tuningArrowColor={tuningArrowColor}
              notchFilters={notchFilters}
              onFilterChange={onFilterChange}
              onAddNotch={onAddNotch}
              onUpdateNotch={onUpdateNotch}
              onRemoveNotch={onRemoveNotch}
            />
          </div>
        ) : null}

        <div className="h-[420px] lg:h-[640px]">
          {canStreamFft ? (
            fftEnabled ? (
              <Waterfall
                frame={lastFftFrame}
                view={waterfallView}
                onViewChange={onWaterfallViewChange}
                palette={waterfallPalette}
                tuning={tuningOverlay}
                minDb={waterfallMinDb}
                maxDb={waterfallMaxDb}
                speed={waterfallSpeed}
                overlays={waterfallOverlays}
                passbandBlendMode={
                  passbandBlendMode as
                    | "screen"
                    | "overlay"
                    | "color-dodge"
                    | "color-burn"
                    | "soft-light"
                    | "none"
                }
                passbandOpacity={passbandOpacity}
                interpolation={waterfallInterpolation}
                gamma={waterfallGamma}
                rowHeight={waterfallRowHeight}
                onPickFrequencyHz={onPickFrequencyHz}
                onSelectRangeHz={onSelectRangeHz}
              />
            ) : (
              <div className="w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-sm text-gray-500">
                Start FFT to show the waterfall.
              </div>
            )
          ) : effectiveState ? (
            <BandScope
              frequencyHz={effectiveState.freq}
              spots={clusterSpots}
              onPickFrequencyHz={onPickFrequencyHz}
            />
          ) : (
            <div className="w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-sm text-gray-500">
              Connect a radio to show the band scope.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
