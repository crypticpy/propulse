import { Card } from "@/components/ui/Card";
import { DataFreshnessIndicator } from "@/components/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileDXWizard } from "@/components/mobile/MobileDXWizard";
import { RadioPickerModal } from "@/components/radio/RadioPickerModal";
import { InfoTip } from "@/components/ui/Tooltip";
import { SIGNAL_TOOLTIPS, GEOGRAPHY_TOOLTIPS } from "@/constants/tooltips";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { useContestContext } from "@/hooks/useContestContext";
import { DxWizardContestNote } from "@/components/dx/DxWizardContestNote";
import { useDXWizardSession } from "@/hooks/useDXWizardSession";
import { getPathStatusColor } from "@/lib/utils/bands";
import {
  formatKHz,
  formatPathBearing,
  formatPathDistanceKm,
  getPropagationModeLabel,
} from "./dxWizardViewHelpers";
import { Link } from "react-router-dom";
import type { LicenseClass, ITURegion } from "@/types/bandplan";
import type { WizardMode } from "@/lib/dxwizard";

export function DXWizard() {
  const session = useDXWizardSession();
  const isMobile = useIsMobile();
  const contestContext = useContestContext();

  if (isMobile) {
    return (
      <>
        <MobileDXWizard session={session} />
        <RadioPickerModal
          isOpen={session.showRadioPicker}
          onClose={() => session.setShowRadioPicker(false)}
          value={{ radioId: session.selectedRadioId }}
          onChange={(next) => session.setSelectedRadioId(next.radioId)}
          title="DX Wizard Radio Profile"
        />
      </>
    );
  }

  const {
    station,
    target,
    recommendation,
    pathSummary,
    nextWindow,
    tips,
    bestMarginDb,
    mode,
    pathMode,
  } = session;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
                DX Wizard
              </h2>
              <HelpTooltip
                section="dx-wizard"
                tooltip="Learn more about DX Wizard"
              />
            </div>
            <p className="text-gray-400 text-sm">
              Path advice for a target: best band and power now, short/long path,
              and the next opening window.
            </p>
          </div>
          <div className="flex items-start gap-4">
            <DataFreshnessIndicator
              dataUpdatedAt={session.wizardDataUpdatedAt}
              onRefresh={session.refetchWizardData}
              isRefetching={session.wizardIsRefetching}
            />
            <div className="text-right text-xs text-gray-500">
              <div className="font-mono">
                Kp={session.currentKp} SFI={session.currentSfi}
              </div>
              {(session.kIndexError || session.solarFluxError) && (
                <div className="text-caution-amber mt-1">
                  Solar data fetch issue — using cached/demo values
                </div>
              )}
            </div>
          </div>
        </div>

        {!station && (
          <Card className="p-5" variant="alert">
            <div className="text-white font-semibold mb-1">Station not set</div>
            <div className="text-sm text-gray-200">
              Set your callsign and grid square in Settings to enable path
              calculations.
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-4">
          <div className="space-y-4">
            <TargetCard session={session} />
            <OperatorCard session={session} />
          </div>

          <div className="space-y-4">
            {!station || !target ? (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Recommendations
                </h3>
                <div className="text-sm text-gray-400">
                  {station
                    ? "Resolve a target to generate recommendations."
                    : "Set your station QTH in Settings to generate recommendations."}
                </div>
              </Card>
            ) : (
              <>
                {pathSummary && (
                  <PathGeometryCard
                    pathSummary={pathSummary}
                    pathMode={pathMode}
                    onPathModeChange={session.setPathMode}
                    mode={mode}
                  />
                )}

                <ResultsCard
                  recommendation={recommendation}
                  tips={tips}
                  mode={mode}
                  bestMarginDb={bestMarginDb}
                />

                {nextWindow && (
                  <Card className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-1">
                          Next best window
                        </h3>
                        <div className="text-sm text-gray-200">
                          {nextWindow.label}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-1">
                          Peak SNR ≈ {nextWindow.window.peakSnr} dB ·{" "}
                          {String(nextWindow.window.peakHour).padStart(2, "0")}
                          :00Z
                        </div>
                      </div>
                      <Link
                        to={session.bandPlannerHref}
                        className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg
                                   bg-plasma-orange/20 border border-plasma-orange/50
                                   text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
                      >
                        Open Band Planner
                      </Link>
                    </div>
                  </Card>
                )}

                {(contestContext.isContestWeekend ||
                  contestContext.activeContests.length > 0) &&
                  session.targetBandsForContest.length > 0 && (
                    <DxWizardContestNote
                      targetBands={session.targetBandsForContest}
                      contestContext={contestContext}
                    />
                  )}
              </>
            )}

            <Card className="p-5">
              <div className="text-xs text-gray-400">Notes</div>
              <div className="text-sm text-gray-300 mt-1">
                Recommendations are estimates based on current solar indices and
                the path model. Long-path mode uses LP distance for antenna gain
                and mode classification; endpoint physics still targets the same
                QTH. Always comply with local regulations and band plans.
              </div>
            </Card>
          </div>
        </div>

        <RadioPickerModal
          isOpen={session.showRadioPicker}
          onClose={() => session.setShowRadioPicker(false)}
          value={{ radioId: session.selectedRadioId }}
          onChange={(next) => session.setSelectedRadioId(next.radioId)}
          title="DX Wizard Radio Profile"
        />
      </div>
    </div>
  );
}

function TargetCard({
  session,
}: {
  session: ReturnType<typeof useDXWizardSession>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">1) Target Station</h3>
        <span className="text-[10px] text-gray-400 inline-flex items-center gap-1">
          grid / coordinates / location
          <InfoTip content={GEOGRAPHY_TOOLTIPS.maidenheadGrid} />
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={session.targetQuery}
            onChange={(e) => session.setTargetQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void session.resolveTarget();
              }
            }}
            placeholder='e.g., "FN31pr", "Tokyo, Japan", or "40.7128, -74.0060"'
            className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                       text-white placeholder-gray-500
                       focus:outline-none focus:border-plasma-orange/50"
          />
          <button
            type="button"
            onClick={() => void session.resolveTarget()}
            disabled={session.targetResolving}
            className="w-full sm:w-auto px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                       text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {session.targetResolving ? "Resolving…" : "Resolve"}
          </button>
        </div>
        {session.targetError && (
          <div className="text-xs text-alert-red">{session.targetError}</div>
        )}

        {session.recentTargets.length > 0 && (
          <div className="relative" ref={session.recentDropdownRef}>
            <button
              type="button"
              onClick={() =>
                session.setShowRecentDropdown(!session.showRecentDropdown)
              }
              className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              Recent PropSphere targets ({session.recentTargets.length})
              <svg
                className={`w-3 h-3 transition-transform ${session.showRecentDropdown ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {session.showRecentDropdown && (
              <div className="absolute left-0 top-full mt-1 z-20 w-72 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-deep-space/95 backdrop-blur-md shadow-lg">
                {session.recentTargets.map((rt, i) => {
                  const grid =
                    rt.grid ??
                    `${rt.lat.toFixed(2)},${rt.lon.toFixed(2)}`;
                  return (
                    <button
                      key={`${rt.lat}-${rt.lon}-${i}`}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                      onClick={() => session.selectRecentTarget(rt)}
                    >
                      <div className="text-sm text-white font-medium truncate">
                        {rt.name ?? grid}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {rt.grid ?? grid} ({rt.lat.toFixed(2)},{" "}
                        {rt.lon.toFixed(2)})
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-white/10">
          <div className="text-xs text-gray-400 mb-2">
            Callsign lookup (Callook → HamQTH → QRZ when unlocked)
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={session.callsignInput}
              onChange={(e) => session.setCallsignInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void session.handleLookupCallsign();
                }
              }}
              placeholder="e.g., W1AW or JA1ABC"
              className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 font-mono
                         focus:outline-none focus:border-plasma-orange/50"
            />
            <button
              type="button"
              onClick={() => void session.handleLookupCallsign()}
              disabled={session.callsignLoading}
              className="w-full sm:w-auto px-4 py-2 bg-white/5 border border-white/10 rounded-lg
                         text-gray-200 hover:bg-white/10 transition-colors font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {session.callsignLoading ? "Looking…" : "Lookup"}
            </button>
          </div>
          {session.callsignError && (
            <div className="text-xs text-alert-red mt-2">
              {session.callsignError}
            </div>
          )}
        </div>

        {session.target && (
          <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-gray-400">Resolved target</div>
            <div className="text-white font-semibold truncate">
              {session.target.label}
            </div>
            <div className="text-xs text-gray-300 font-mono mt-1 inline-flex items-center gap-1">
              {session.target.grid} • {session.target.lat.toFixed(3)}°,{" "}
              {session.target.lon.toFixed(3)}°
              <InfoTip content={GEOGRAPHY_TOOLTIPS.maidenheadGrid} />
            </div>
            {session.target.lookupSources &&
              session.target.lookupSources.length > 0 && (
                <div className="text-[10px] text-gray-500 mt-1">
                  via {session.target.lookupSources.join(" + ")}
                </div>
              )}
          </div>
        )}
      </div>
    </Card>
  );
}

function OperatorCard({
  session,
}: {
  session: ReturnType<typeof useDXWizardSession>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">2) Operator Profile</h3>
        {session.station && (
          <div className="text-[10px] text-gray-400 font-mono inline-flex items-center gap-1">
            {session.station.callsign} • {session.station.grid}
            <InfoTip content={GEOGRAPHY_TOOLTIPS.maidenheadGrid} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-300 mb-1">Mode</label>
          <div className="flex flex-wrap gap-1 p-1 bg-white/5 rounded-lg">
            {session.modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => session.setMode(m)}
                className={`flex-1 min-w-[3.5rem] px-2 py-2 rounded-md text-xs font-semibold transition-colors ${
                  session.mode === m
                    ? "bg-plasma-orange text-white"
                    : "text-gray-300 hover:text-white hover:bg-white/5"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-300 mb-1">
            License Class
          </label>
          <select
            value={session.licenseClass}
            onChange={(e) =>
              session.setLicenseClass(e.target.value as LicenseClass)
            }
            className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          >
            {(
              [
                "TECHNICIAN",
                "GENERAL",
                "EXTRA",
                "ADVANCED",
                "NOVICE",
              ] as const
            ).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-300 mb-1">ITU Region</label>
          <select
            value={session.ituRegion}
            onChange={(e) =>
              session.setItuRegion(e.target.value as ITURegion)
            }
            className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          >
            {(["ITU1", "ITU2", "ITU3"] as const).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-300 mb-1">
            Radio Profile
          </label>
          <button
            type="button"
            onClick={() => session.setShowRadioPicker(true)}
            className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                       text-left text-white text-sm hover:border-white/20
                       focus:outline-none focus:border-plasma-orange/50 transition-colors"
          >
            {session.selectedRadio
              ? session.getRadioLabel(
                  session.selectedRadio,
                  session.selectedRadioId === null
                    ? session.activeUserRadio?.nickname
                    : session.selectedRadioInstance?.nickname,
                )
              : "Select a radio…"}
            {session.selectedRadioId === null && (
              <span className="ml-2 text-[10px] text-gray-400">(active)</span>
            )}
          </button>
          {session.selectedRadio && (
            <div className="text-[10px] text-gray-400 mt-1">
              Max power: {session.selectedRadio.maxPower}W • Modes:{" "}
              {session.selectedRadio.modes.slice(0, 4).join(", ")}
              {session.selectedRadio.modes.length > 4 ? "…" : ""}
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-300 mb-1">
            TX power ceiling (watts)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={session.effectiveMaxPower}
              value={Math.min(
                session.txPowerCeilingWatts,
                session.effectiveMaxPower,
              )}
              onChange={(e) =>
                session.setTxPowerCeilingWatts(Number(e.target.value))
              }
              className="flex-1"
            />
            <div className="w-20 text-right font-mono text-sm text-white">
              {session.txPowerCeilingWatts}W
            </div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Ceiling is also capped by band plan limits for your license/mode.
          </div>
        </div>
      </div>
    </Card>
  );
}

function PathGeometryCard({
  pathSummary,
  pathMode,
  onPathModeChange,
  mode,
}: {
  pathSummary: NonNullable<
    ReturnType<typeof useDXWizardSession>["pathSummary"]
  >;
  pathMode: "short" | "long";
  onPathModeChange: (m: "short" | "long") => void;
  mode: WizardMode;
}) {
  const prop = pathSummary.propagation;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Path geometry</h3>
        <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg">
          {(["short", "long"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPathModeChange(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                pathMode === m
                  ? "bg-plasma-orange text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {m === "short" ? "Short path" : "Long path"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="Distance"
          value={formatPathDistanceKm(pathSummary.active.distanceKm)}
          sub={`${Math.round(pathSummary.active.distanceMi).toLocaleString()} mi`}
        />
        <Metric
          label="Bearing"
          value={formatPathBearing(pathSummary.active.bearing)}
          sub={`RCP ${Math.round(pathSummary.active.reciprocal)}°`}
        />
        <Metric
          label="SP / LP"
          value={`${Math.round(pathSummary.metrics.shortPath.distance / 1000)}k / ${Math.round(pathSummary.metrics.longPath.distance / 1000)}k`}
          sub="km (approx)"
        />
        <Metric
          label="Prop mode"
          value={prop ? getPropagationModeLabel(prop.primaryMode) : "—"}
          sub={
            prop
              ? `${prop.confidenceLabel} · ${mode}`
              : undefined
          }
        />
      </div>
      {prop?.operationalAdvice && (
        <div className="mt-3 text-xs text-gray-400">{prop.operationalAdvice}</div>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-sm font-mono font-bold text-white mt-0.5 truncate">
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ResultsCard({
  recommendation,
  tips,
  mode,
  bestMarginDb,
}: {
  recommendation: ReturnType<typeof useDXWizardSession>["recommendation"];
  tips: Array<{ label: string; value: string }>;
  mode: WizardMode;
  bestMarginDb: number | null;
}) {
  if (!recommendation) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          3) Recommendations
        </h3>
        <div className="text-sm text-gray-400">
          Resolve a target and verify your constraints.
        </div>
      </Card>
    );
  }

  if (recommendation.type === "none") {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          3) Recommendations
        </h3>
        <div className="text-alert-red font-semibold">
          No viable band/mode options found
        </div>
        <div className="text-sm text-gray-300 mt-1">
          Try FT8/FT4, reduce constraints, switch path mode, or wait for a
          better window below.
        </div>
        <AllBandsList bands={recommendation.bands} />
      </Card>
    );
  }

  const best = recommendation.best;
  const confidence = best.signalPrediction?.confidence;

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">3) Recommendations</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">
            Band
          </div>
          <div
            className={`text-2xl font-mono font-bold ${getPathStatusColor(best.status)}`}
          >
            {best.band}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">{best.frequency}</div>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">
            Required TX Power
          </div>
          <div className="text-2xl font-mono font-bold text-plasma-orange">
            {best.requiredWatts}W
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            Ceiling: {best.ceilingWatts}W{" "}
            {!best.withinCeiling && (
              <span className="text-alert-red">• exceeds</span>
            )}
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">
            Target Frequency
          </div>
          <div className="text-lg font-mono font-bold text-white">
            {formatKHz(best.freqsKHz[0])}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">Mode: {mode}</div>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs text-gray-300">{best.notes}</div>
        <div className="mt-2 text-[10px] text-gray-400 font-mono">
          Est. SNR <InfoTip content={SIGNAL_TOOLTIPS.snr} /> @100W:{" "}
          {best.snrEstimate} dB
          {bestMarginDb !== null && (
            <>
              {" "}
              • Margin vs {mode}: {bestMarginDb >= 0 ? "+" : ""}
              {bestMarginDb.toFixed(0)} dB
            </>
          )}
          {typeof confidence === "number" && (
            <>
              {" "}
              • Confidence: {Math.round(confidence)}%
            </>
          )}
          {best.pathLoss !== undefined && (
            <>
              {" "}
              • Path loss: {Math.round(best.pathLoss)} dB
            </>
          )}
          {recommendation.antennaGainDbi !== 0 && (
            <span className="text-gray-500 text-[10px] font-mono ml-1">
              • Ant: {recommendation.antennaGainDbi > 0 ? "+" : ""}
              {recommendation.antennaGainDbi.toFixed(1)} dBi
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-xs font-semibold text-white mb-2">
            Alternate Frequencies
          </div>
          <div className="space-y-1 text-sm text-gray-200 font-mono">
            {best.freqsKHz.slice(0, 3).map((f) => (
              <div key={f}>{formatKHz(f)}</div>
            ))}
          </div>
          {best.legalMaxWatts !== null && (
            <div className="mt-2 text-[10px] text-gray-400">
              Band plan max: {best.legalMaxWatts}W
            </div>
          )}
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-xs font-semibold text-white mb-2">
            DX Tips ({mode})
          </div>
          <div className="space-y-1 text-sm text-gray-200">
            {tips.map((t) => (
              <div key={t.label} className="flex gap-2">
                <span className="text-gray-300 font-semibold w-28">
                  {t.label}
                </span>
                <span className="text-gray-200">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AllBandsList
        bands={recommendation.bands}
        candidates={recommendation.candidates}
      />
    </Card>
  );
}

function AllBandsList({
  bands,
  candidates,
}: {
  bands: Array<{
    band: string;
    frequency: string;
    status: string;
    snrEstimate: number;
    notes: string;
    pathLoss?: number;
  }>;
  candidates?: Array<{
    band: string;
    requiredWatts: number;
    withinCeiling: boolean;
  }>;
}) {
  const candidateMap = new Map(
    (candidates ?? []).map((c) => [c.band, c] as const),
  );
  // Ranked candidates first, then remaining closed/unavailable bands.
  const candidateBands = (candidates ?? [])
    .map((c) => bands.find((b) => b.band === c.band))
    .filter((b): b is (typeof bands)[number] => Boolean(b));
  const candidateBandSet = new Set(candidateBands.map((b) => b.band));
  const remainder = bands.filter((b) => !candidateBandSet.has(b.band));
  const ordered = [...candidateBands, ...remainder];

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400 uppercase tracking-wide">
        All bands
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {ordered.map((band) => {
          const cand = candidateMap.get(band.band);
          return (
            <div
              key={band.band}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`font-mono font-bold text-sm ${getPathStatusColor(band.status as "excellent" | "good" | "fair" | "poor" | "closed")}`}
                >
                  {band.band}
                </span>
                <span className="text-xs text-gray-500 truncate">
                  {band.frequency}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-gray-300 capitalize">
                  {band.status}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {band.snrEstimate} dB
                  {cand
                    ? ` · ${cand.requiredWatts}W${cand.withinCeiling ? "" : " !"}`
                    : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DXWizard;
