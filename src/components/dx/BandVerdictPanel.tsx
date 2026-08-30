/**
 * BandVerdictPanel — E4 "physics × live spots" strip.
 *
 * One chip per band showing the stable (hold-confirmed) verdict from
 * useBandVerdicts. Clicking a chip opens a small anchored popover with the
 * confidence, why-lines, stable-since time, and recent flip history for
 * that band. No flyouts — the popover is positioned relative to its chip.
 */

import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/Card";
import { useBandVerdicts, type BandVerdictEntry } from "@/hooks/useBandVerdicts";
import {
  useBandActivity,
  type BandActivityStatus,
} from "@/hooks/useBandActivity";
import { useVerdictStore } from "@/stores/verdictStore";
import type { BandVerdict } from "@/lib/verdict/verdictEngine";
import type { ActivityLevel, ActivityTrend } from "@/lib/utils/bandActivity";

const VERDICT_LABEL: Record<BandVerdict, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  surprise: "Surprise",
  closed: "Closed",
};

const VERDICT_CHIP_CLASSES: Record<BandVerdict, string> = {
  confirmed: "bg-signal-green/20 border-signal-green text-signal-green",
  likely: "border-signal-green/40 text-signal-green/70",
  surprise:
    "bg-plasma-orange/20 border-plasma-orange text-plasma-orange animate-pulse",
  closed: "border-white/10 text-gray-500",
};

const VERDICT_TEXT_CLASSES: Record<BandVerdict, string> = {
  confirmed: "text-signal-green",
  likely: "text-signal-green/70",
  surprise: "text-plasma-orange",
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

interface BandVerdictChipProps {
  entry: BandVerdictEntry;
  activity: BandActivityStatus | undefined;
  open: boolean;
  onToggle: () => void;
}

function BandVerdictChip({
  entry,
  activity,
  open,
  onToggle,
}: BandVerdictChipProps) {
  const log = useVerdictStore((s) => s.log);
  const recent = log.filter((l) => l.band === entry.band).slice(0, 3);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${VERDICT_CHIP_CLASSES[entry.stable]}`}
      >
        <span className="font-semibold">{entry.band}</span>
        <span>{VERDICT_LABEL[entry.stable]}</span>
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
          aria-label={`${entry.band} verdict details`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span
              className={`text-sm font-semibold ${VERDICT_TEXT_CLASSES[entry.stable]}`}
            >
              {entry.band} — {VERDICT_LABEL[entry.stable]}
            </span>
            <span className="text-[10px] text-white/40 font-mono">
              {Math.round(entry.result.confidence * 100)}%
            </span>
          </div>

          <ul className="space-y-1 mb-2">
            {entry.result.why.map((line, i) => (
              <li key={i} className="text-[11px] text-white/60 leading-snug">
                {line}
              </li>
            ))}
          </ul>

          <div className="text-[10px] text-white/40 mb-1.5">
            Stable since{" "}
            {formatDistanceToNow(new Date(entry.since), { addSuffix: true })}
          </div>

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
                    {VERDICT_LABEL[entryLog.from]} →{" "}
                    {VERDICT_LABEL[entryLog.to]}
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
  const { bands, ready } = useBandVerdicts();
  const { data: activityByBand } = useBandActivity();
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

  return (
    <Card className="p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-orbitron uppercase tracking-wide text-gray-300">
          Band Verdict
        </h3>
        <span className="text-[10px] text-white/30">
          physics × live spots
        </span>
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
