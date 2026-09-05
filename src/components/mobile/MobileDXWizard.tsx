/**
 * MobileDXWizard — step-based mobile flow over useDXWizardSession.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { DataFreshnessIndicator } from "@/components/ui";
import { getPathStatusColor } from "@/lib/utils/bands";
import { useContestContext } from "@/hooks/useContestContext";
import { DxWizardContestNote } from "@/components/dx/DxWizardContestNote";
import type { DXWizardSession } from "@/hooks/useDXWizardSession";
import { formatKHz } from "@/lib/dxwizard";
import { formatPathBearing, formatPathDistanceKm } from "@/pages/dxWizardViewHelpers";
import type { LicenseClass, ITURegion } from "@/types/bandplan";

export interface MobileDXWizardProps {
  session: DXWizardSession;
}

export function MobileDXWizard({ session }: MobileDXWizardProps) {
  const [showResults, setShowResults] = useState(false);
  const [expandedBand, setExpandedBand] = useState<string | null>(null);
  const contestContext = useContestContext(session.solarHandoff?.at);

  const handleAnalyze = () => {
    if (session.target) setShowResults(true);
  };

  if (showResults && session.recommendation) {
    return (
      <ResultsStep
        session={session}
        expandedBand={expandedBand}
        setExpandedBand={setExpandedBand}
        onBack={() => setShowResults(false)}
        contestContext={contestContext}
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-orbitron text-xl font-black text-gradient-orange">
            DX Wizard
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Target → constraints → band & power advice
          </p>
        </div>
        <DataFreshnessIndicator
          dataUpdatedAt={session.wizardDataUpdatedAt}
          onRefresh={session.refetchWizardData}
          isRefetching={session.wizardIsRefetching}
        />
      </div>

      {!session.station && (
        <div className="rounded-xl border border-alert-red/40 bg-alert-red/10 p-3 text-sm text-gray-200">
          Set your station callsign and grid in Settings first.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-gray-400">Target</label>
        <div className="flex gap-2">
          <input
            value={session.targetQuery}
            onChange={(e) => session.setTargetQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void session.resolveTarget();
              }
            }}
            placeholder="Grid, place, or coords"
            className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg text-white text-sm"
          />
          <button
            type="button"
            onClick={() => void session.resolveTarget()}
            className="px-3 py-2 rounded-lg bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange text-sm font-medium"
          >
            Go
          </button>
        </div>
        {session.targetError && (
          <div className="text-xs text-alert-red">{session.targetError}</div>
        )}
      </div>

      {session.recentTargets.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500">Recent targets</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {session.recentTargets.slice(0, 8).map((rt, i) => (
              <button
                key={`${rt.lat}-${rt.lon}-${i}`}
                type="button"
                onClick={() => session.selectRecentTarget(rt)}
                className="shrink-0 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200"
              >
                {rt.name ?? rt.grid ?? `${rt.lat.toFixed(1)},${rt.lon.toFixed(1)}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-gray-400">Callsign</label>
        <div className="flex gap-2">
          <input
            value={session.callsignInput}
            onChange={(e) => session.setCallsignInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void session.handleLookupCallsign();
              }
            }}
            placeholder="JA1ABC"
            className="flex-1 px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg text-white text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => void session.handleLookupCallsign()}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-200 text-sm"
          >
            Lookup
          </button>
        </div>
        {session.callsignError && (
          <div className="text-xs text-alert-red">{session.callsignError}</div>
        )}
      </div>

      {session.target && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white">
          {session.target.label}
          <div className="text-[10px] text-gray-400 font-mono mt-1">
            {session.target.grid}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-gray-400">Mode</label>
        <div className="flex flex-wrap gap-1">
          {session.modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => session.setMode(m)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${
                session.mode === m
                  ? "bg-plasma-orange text-white"
                  : "bg-white/5 text-gray-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        {(["short", "long"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => session.setPathMode(m)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
              session.pathMode === m
                ? "bg-plasma-orange text-white"
                : "bg-white/5 text-gray-300"
            }`}
          >
            {m === "short" ? "Short path" : "Long path"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={session.licenseClass}
          onChange={(e) =>
            session.setLicenseClass(e.target.value as LicenseClass)
          }
          className="px-2 py-2 bg-deep-space/70 border border-white/10 rounded-lg text-white text-xs"
        >
          {["TECHNICIAN", "GENERAL", "EXTRA", "ADVANCED", "NOVICE"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={session.ituRegion}
          onChange={(e) => session.setItuRegion(e.target.value as ITURegion)}
          className="px-2 py-2 bg-deep-space/70 border border-white/10 rounded-lg text-white text-xs"
        >
          {["ITU1", "ITU2", "ITU3"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => session.setShowRadioPicker(true)}
        className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg text-left text-white text-sm"
      >
        {session.radioLabel || "Select radio…"}
      </button>

      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>TX ceiling</span>
          <span className="font-mono text-white">
            {session.txPowerCeilingWatts}W
          </span>
        </div>
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
          className="w-full"
        />
      </div>

      <button
        type="button"
        disabled={!session.target || !session.station}
        onClick={handleAnalyze}
        className="w-full py-3 rounded-xl bg-plasma-orange text-white font-semibold disabled:opacity-40"
      >
        Analyze path
      </button>

      <div className="text-center text-[10px] text-gray-500 font-mono">
        Kp={session.currentKp} · SFI={session.currentSfi}
      </div>
    </div>
  );
}

function ResultsStep({
  session,
  expandedBand,
  setExpandedBand,
  onBack,
  contestContext,
}: {
  session: DXWizardSession;
  expandedBand: string | null;
  setExpandedBand: (b: string | null) => void;
  onBack: () => void;
  contestContext: ReturnType<typeof useContestContext>;
}) {
  const rec = session.recommendation!;
  const path = session.pathSummary;

  if (rec.type === "none") {
    return (
      <div className="p-4 space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-400"
        >
          ← Change target
        </button>
        <div className="rounded-2xl border border-white/10 p-4">
          <div className="text-alert-red font-semibold">No viable options</div>
          <div className="text-sm text-gray-300 mt-1">
            Try FT8/FT4 or check the next window.
          </div>
        </div>
        {session.nextWindow && (
          <Link
            to={session.bandPlannerHref}
            className="block text-center py-2 rounded-lg bg-plasma-orange/20 text-plasma-orange text-sm"
          >
            {session.nextWindow.label} — Band Planner
          </Link>
        )}
      </div>
    );
  }

  const best = rec.best;

  return (
    <div className="p-4 space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-gray-400">
        ← Change target
      </button>

      {session.target && (
        <div className="text-xs text-gray-400 font-mono">
          {session.target.label} ({session.target.grid})
        </div>
      )}

      {path && (
        <div className="rounded-2xl border border-white/10 p-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-gray-500">Distance</div>
            <div className="font-mono text-white">
              {formatPathDistanceKm(path.active.distanceKm)}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Bearing</div>
            <div className="font-mono text-white">
              {formatPathBearing(path.active.bearing)}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 p-4 space-y-3">
        <div className="text-xs text-gray-400 uppercase">Best band</div>
        <div className="flex items-end justify-between">
          <div>
            <div
              className={`text-3xl font-orbitron font-bold ${getPathStatusColor(best.status)}`}
            >
              {best.band}
            </div>
            <div className="text-xs text-gray-400">{best.frequency}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-plasma-orange">
              {best.requiredWatts}W
            </div>
            <div className="text-[10px] text-gray-400">
              Ceiling: {best.ceilingWatts}W
              {!best.withinCeiling && (
                <span className="text-alert-red"> · exceeds</span>
              )}
            </div>
            <div className="text-[10px] text-gray-400">
              {formatKHz(best.freqsKHz[0])} · {session.mode}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-300">{best.notes}</div>
      </div>

      {session.nextWindow && (
        <Link
          to={session.bandPlannerHref}
          className="block rounded-xl border border-plasma-orange/40 bg-plasma-orange/10 p-3 text-sm text-plasma-orange"
        >
          {session.nextWindow.label}
          <div className="text-[10px] text-gray-400 mt-1">
            Open Band Planner →
          </div>
        </Link>
      )}

      {(contestContext.isContestWeekend ||
        contestContext.activeContests.length > 0) &&
        session.targetBandsForContest.length > 0 && (
          <DxWizardContestNote
            targetBands={session.targetBandsForContest}
            contestContext={contestContext}
          />
        )}

      <div className="space-y-2">
        <div className="text-xs text-gray-400 uppercase px-1">All bands</div>
        {rec.bands.map((band) => {
          const isExpanded = expandedBand === band.band;
          return (
            <button
              key={band.band}
              type="button"
              onClick={() =>
                setExpandedBand(isExpanded ? null : band.band)
              }
              className="w-full text-left bg-white/[0.03] border border-white/10 rounded-xl p-3"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-mono font-bold text-sm ${getPathStatusColor(band.status)}`}
                >
                  {band.band}
                </span>
                <span className="text-xs text-gray-400 capitalize">
                  {band.status}
                </span>
              </div>
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-300 space-y-1">
                  <div>
                    SNR @{session.txPowerCeilingWatts}W:{" "}
                    <span className="font-mono text-white">
                      {band.snrEstimate} dB
                    </span>
                  </div>
                  <div className="text-gray-400">{band.notes}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
