/**
 * BandVerdictPanel — Band Health ladder strip (BH2).
 *
 * One chip per band showing the stable (hold-confirmed) five-state ladder
 * from useBandVerdicts for the operator's headline scope, with the surprise
 * pulse, Fading modifier, and dominant mode-class badge. Clicking a chip
 * opens a small anchored popover with the why-lines, canonical server
 * ladder provenance, activity detail, and recent flip history. No flyouts —
 * the popover is positioned relative to its chip.
 */

import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/Card";
import { useBandVerdicts, type BandLadderEntry } from "@/hooks/useBandVerdicts";
import {
  useBandActivity,
  type BandActivityStatus,
} from "@/hooks/useBandActivity";
import {
  useBandLadder,
  canonicalKey,
  type CanonicalLadderRow,
} from "@/hooks/useBandLadder";
import { useVerdictStore } from "@/stores/verdictStore";
import type { LadderState } from "@/lib/verdict/ladder";
import type { ActivityLevel, ActivityTrend } from "@/lib/utils/bandActivity";

const LADDER_LABEL: Record<LadderState, string> = {
  closed: "Closed",
  forecast: "Forecast",
  stirring: "Stirring",
  verified: "Verified Open",
  hot: "Hot",
};

const LADDER_CHIP_CLASSES: Record<LadderState, string> = {
  hot: "bg-plasma-orange/20 border-plasma-orange text-plasma-orange",
  verified: "bg-signal-green/20 border-signal-green text-signal-green",
  stirring: "border-caution-amber/50 text-caution-amber",
  forecast: "border-signal-green/40 text-signal-green/70",
  closed: "border-white/10 text-gray-500",
};

const LADDER_TEXT_CLASSES: Record<LadderState, string> = {
  hot: "text-plasma-orange",
  verified: "text-signal-green",
  stirring: "text-caution-amber",
  forecast: "text-signal-green/70",
  closed: "text-gray-500",
};

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  quiet: "Quiet",
  normal: "Normal",
  busy: "Busy",
  exceptional: "Exceptional",
};

const ACTIVITY_TEXT_CLASSES: Record<ActivityLevel, string> = {
  quiet: "text-gray-500",
  normal: "text-white/60",
  busy: "text-caution-amber",
  exceptional: "text-plasma-orange",
};

const TREND_ARROW: Record<ActivityTrend, string> = {
  rising: "↗",
  steady: "→",
  falling: "↘",
};

const MODE_BADGE_LABEL: Record<string, string> = {
  cw: "CW",
  digital: "DIG",
  phone: "PH",
};

/** BH3 lead-time minutes from the server tick's inputs, when present. */
function leadMinutes(
  inputs: Record<string, unknown>,
  key: "opens_in_min" | "fades_in_min",
): number | null {
  const value = inputs[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function formatLead(min: number): string {
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Dominant mode class of the 20-min deduplicated observations, if any. */
function dominantModeClass(
  modeObs20m: Record<string, number> | undefined,
): string | null {
  if (!modeObs20m) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [mode, count] of Object.entries(modeObs20m)) {
    if (!(mode in MODE_BADGE_LABEL)) continue;
    if (count > bestCount) {
      best = mode;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

interface BandVerdictChipProps {
  entry: BandLadderEntry;
  activity: BandActivityStatus | undefined;
  canonical: CanonicalLadderRow | undefined;
  open: boolean;
  onToggle: () => void;
}

function BandVerdictChip({
  entry,
  activity,
  canonical,
  open,
  onToggle,
}: BandVerdictChipProps) {
  const log = useVerdictStore((s) => s.log);
  const recent = log
    .filter(
      (l) => l.band === entry.band && l.scopeId === entry.result.scopeId,
    )
    .slice(0, 3);

  const surprise = entry.result.evaluation.surprise;
  const modeClass = dominantModeClass(entry.result.counts?.modeObs20m);
  const canonicalOpens = canonical
    ? leadMinutes(canonical.inputs, "opens_in_min")
    : null;
  const canonicalFades = canonical
    ? leadMinutes(canonical.inputs, "fades_in_min")
    : null;
  // Chip-level hint only while the server scope is still shut — an "opens"
  // countdown on an already-open band would just be noise.
  const opensChip =
    canonical &&
    (canonical.state === "closed" || canonical.state === "forecast")
      ? canonicalOpens
      : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${LADDER_CHIP_CLASSES[entry.stable]} ${
          surprise ? "animate-pulse" : ""
        }`}
      >
        <span className="font-semibold">{entry.band}</span>
        <span>{LADDER_LABEL[entry.stable]}</span>
        {surprise && (
          <span
            className="px-1 rounded bg-plasma-orange/20 text-plasma-orange text-[10px] uppercase tracking-wide"
            title="Activity the forecast did not predict"
          >
            Surprise
          </span>
        )}
        {entry.fading && (
          <span className="text-[10px] uppercase tracking-wide text-white/40">
            Fading
          </span>
        )}
        {opensChip !== null && (
          <span
            className="text-[10px] tracking-wide text-signal-green/60"
            title="Physics expects this band to cross its open threshold"
          >
            opens ~{formatLead(opensChip)}
          </span>
        )}
        {modeClass && (
          <span className="px-1 rounded bg-white/5 text-white/50 text-[10px] uppercase tracking-wide">
            {MODE_BADGE_LABEL[modeClass]}
          </span>
        )}
        {activity && activity.count60m > 0 && (
          <span
            className={
              activity.level
                ? ACTIVITY_TEXT_CLASSES[activity.level]
                : "text-white/40"
            }
            aria-label={`activity ${activity.trend}`}
          >
            {TREND_ARROW[activity.trend]}
          </span>
        )}
        {activity?.crowded && (
          <span className="px-1 rounded bg-plasma-orange/20 text-plasma-orange text-[10px] uppercase tracking-wide">
            Crowded
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 w-64 z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3"
          role="dialog"
          aria-label={`${entry.band} band health details`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span
              className={`text-sm font-semibold ${LADDER_TEXT_CLASSES[entry.stable]}`}
            >
              {entry.band} — {LADDER_LABEL[entry.stable]}
            </span>
            <span className="text-[10px] text-white/40 font-mono">
              {entry.result.inputs.obs20m} obs ·{" "}
              {entry.result.inputs.reporters20m} rpt
            </span>
          </div>

          <ul className="space-y-1 mb-2">
            {entry.result.evaluation.why.map((line, i) => (
              <li key={i} className="text-[11px] text-white/60 leading-snug">
                {line}
              </li>
            ))}
          </ul>

          <div className="text-[10px] text-white/40 mb-1.5">
            Stable since{" "}
            {formatDistanceToNow(new Date(entry.since), { addSuffix: true })}
          </div>

          {canonical && (
            <div className="border-t border-white/5 pt-1.5 mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">
                Server ladder
              </div>
              <div className="text-[11px] text-white/60">
                <span className={LADDER_TEXT_CLASSES[canonical.state]}>
                  {LADDER_LABEL[canonical.state]}
                </span>
                {canonical.surprise && (
                  <span className="text-plasma-orange"> · surprise</span>
                )}
                {canonical.openedAt && (
                  <span className="text-white/40">
                    {" "}
                    · open{" "}
                    {formatDistanceToNow(new Date(canonical.openedAt), {
                      addSuffix: false,
                    })}
                  </span>
                )}
              </div>
              {canonicalOpens !== null && (
                <div className="text-[11px] text-white/60">
                  Likely opens in ~{formatLead(canonicalOpens)}
                  <span className="text-white/30"> · physics sweep</span>
                </div>
              )}
              {canonicalFades !== null && (
                <div className="text-[11px] text-white/60">
                  May fade in ~{formatLead(canonicalFades)}
                  <span className="text-white/30"> · physics sweep</span>
                </div>
              )}
            </div>
          )}

          {activity && (
            <div className="border-t border-white/5 pt-1.5 mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">
                Activity
              </div>
              <div className="text-[11px] text-white/60">
                {activity.level ? (
                  <span className={ACTIVITY_TEXT_CLASSES[activity.level]}>
                    {ACTIVITY_LABEL[activity.level]}
                  </span>
                ) : (
                  <span className="text-white/40">No baseline yet</span>
                )}{" "}
                <span aria-hidden="true">
                  {TREND_ARROW[activity.trend]}
                </span>{" "}
                {activity.trend}
              </div>
              <div className="text-[11px] text-white/60 font-mono">
                {activity.count60m} spots/hr · {activity.obs20m} obs ·{" "}
                {activity.reporters20m} reporters (20 min)
              </div>
              {Object.keys(activity.modeObs20m).length > 0 && (
                <div className="text-[10px] text-white/40 font-mono">
                  {Object.entries(activity.modeObs20m)
                    .filter(([, n]) => n > 0)
                    .map(([mode, n]) => `${MODE_BADGE_LABEL[mode] ?? mode} ${n}`)
                    .join(" · ")}
                </div>
              )}
              {Object.keys(activity.sourceCounts60m).length > 0 && (
                <div className="text-[10px] text-white/40 font-mono">
                  via{" "}
                  {Object.entries(activity.sourceCounts60m)
                    .filter(([, n]) => n > 0)
                    .map(([source, n]) => `${source} ${n}`)
                    .join(" · ")}
                </div>
              )}
              {activity.level && activity.thresholds && (
                <div className="text-[10px] text-white/40 font-mono">
                  vs this hour: p25 {Math.round(activity.thresholds.p25)} ·
                  p75 {Math.round(activity.thresholds.p75)} · p95{" "}
                  {Math.round(activity.thresholds.p95)}
                </div>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div className="border-t border-white/5 pt-1.5">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">
                Recent
              </div>
              <ul className="space-y-0.5">
                {recent.map((entryLog) => (
                  <li
                    key={entryLog.id}
                    className="text-[11px] text-white/60 font-mono"
                  >
                    {format(new Date(entryLog.at), "HH:mm")}{" "}
                    {LADDER_LABEL[entryLog.from]} →{" "}
                    {LADDER_LABEL[entryLog.to]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BandVerdictPanel() {
  const { bands, ready, scope, activityScope, dxAvailable } =
    useBandVerdicts();
  const { data: activityByBand } = useBandActivity(activityScope);
  const { data: canonicalByKey } = useBandLadder();
  const dxMode = useVerdictStore((s) => s.dxMode);
  const setDxMode = useVerdictStore((s) => s.setDxMode);
  const [openBand, setOpenBand] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openBand) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenBand(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenBand(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openBand]);

  // The collector's canonical ladder covers global + regional scopes only;
  // DX field pairs are client-side (see DEV-PLAN-BAND-HEALTH §6).
  const canonicalFor = (band: string): CanonicalLadderRow | undefined => {
    if (!canonicalByKey) return undefined;
    if (scope.type === "regional" && scope.continent) {
      return canonicalByKey.get(
        canonicalKey("regional", scope.continent, band),
      );
    }
    if (scope.type === "global") {
      return canonicalByKey.get(canonicalKey("global", "", band));
    }
    return undefined;
  };

  return (
    <Card className="p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-orbitron uppercase tracking-wide text-gray-300">
          Band Health
        </h3>
        <span className="text-[10px] text-white/30">{scope.label}</span>
        {dxAvailable && (
          <button
            type="button"
            onClick={() => setDxMode(!dxMode)}
            aria-pressed={dxMode}
            className={`ml-auto px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wide transition-colors ${
              dxMode
                ? "border-nebula-blue text-nebula-blue bg-nebula-blue/10"
                : "border-white/10 text-white/40 hover:text-white/60"
            }`}
          >
            DX
          </button>
        )}
      </div>

      {!ready ? (
        <div className="text-sm text-gray-500 py-2">
          Waiting for solar data…
        </div>
      ) : (
        <div ref={containerRef} className="flex flex-wrap gap-2">
          {bands.map((entry) => (
            <BandVerdictChip
              key={entry.band}
              entry={entry}
              activity={activityByBand?.get(entry.band)}
              canonical={canonicalFor(entry.band)}
              open={openBand === entry.band}
              onToggle={() =>
                setOpenBand((current) =>
                  current === entry.band ? null : entry.band,
                )
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default BandVerdictPanel;
