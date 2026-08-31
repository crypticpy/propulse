/**
 * BandVerdictPanel — Band Health ladder strip (BH2).
 *
 * One chip per band showing the stable (hold-confirmed) five-state ladder
 * from useBandVerdicts for the operator's headline scope, with the surprise
 * pulse, Fading modifier, and dominant mode-class badge. Clicking a chip
 * opens the shared evidence dialog with why-lines, canonical server ladder
 * provenance, activity detail, and recent flip history. The dialog is
 * portal-rendered so it stays above all dashboard card stacking contexts.
 */

import { useState } from "react";
import {
  ACTIVITY_TEXT_CLASSES,
  LADDER_LABEL,
  MODE_BADGE_LABEL,
  TREND_ARROW,
  dominantModeClass,
  formatLead,
  leadMinutes,
} from "@/lib/verdict/presentation";
import { BandVerdictDetailsDialog } from "@/components/dx/BandVerdictDetailsDialog";
import { Card } from "@/components/ui/Card";
import {
  useBandActivity,
  type BandActivityStatus,
} from "@/hooks/useBandActivity";
import {
  canonicalKey,
  useBandLadder,
  type CanonicalLadderRow,
} from "@/hooks/useBandLadder";
import { useBandVerdicts, type BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { LadderState } from "@/lib/verdict/ladder";
import { useVerdictStore } from "@/stores/verdictStore";

const LADDER_CHIP_CLASSES: Record<LadderState, string> = {
  hot: "bg-plasma-orange/20 border-plasma-orange text-plasma-orange",
  verified: "bg-signal-green/20 border-signal-green text-signal-green",
  stirring: "border-caution-amber/50 text-caution-amber",
  forecast: "border-signal-green/40 text-signal-green/70",
  closed: "border-white/10 text-gray-500",
};

interface BandVerdictChipProps {
  entry: BandLadderEntry;
  activity?: BandActivityStatus;
  canonical?: CanonicalLadderRow;
  scopeLabel: string;
  open: boolean;
  onToggle: () => void;
}

function BandVerdictChip({
  entry,
  activity,
  canonical,
  scopeLabel,
  open,
  onToggle,
}: BandVerdictChipProps) {
  const surprise = entry.result.evaluation.surprise;
  const modeClass = dominantModeClass(entry.result.counts?.modeObs20m);
  const canonicalOpens = canonical
    ? leadMinutes(canonical, "opens_in_min")
    : null;
  // Chip-level hint only while the server scope is still shut — an "opens"
  // countdown on an already-open band would just be noise.
  const opensChip =
    canonical &&
    (canonical.state === "closed" || canonical.state === "forecast")
      ? canonicalOpens
      : null;

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${LADDER_CHIP_CLASSES[entry.stable]} ${
          surprise ? "animate-pulse" : ""
        }`}
      >
        <span className="font-semibold">{entry.band}</span>
        <span>{LADDER_LABEL[entry.stable]}</span>
        {surprise && (
          <span
            className="rounded bg-plasma-orange/20 px-1 text-[10px] uppercase tracking-wide text-plasma-orange"
            title="Activity the forecast did not predict"
          >
            Surprise
          </span>
        )}
        {entry.fading && (
          <span className="text-[10px] uppercase tracking-wide text-white/50">
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
          <span className="rounded bg-white/5 px-1 text-[10px] uppercase tracking-wide text-white/50">
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
          <span className="rounded bg-plasma-orange/20 px-1 text-[10px] uppercase tracking-wide text-plasma-orange">
            Crowded
          </span>
        )}
      </button>

      {open && (
        <BandVerdictDetailsDialog
          entry={entry}
          activity={activity}
          canonical={canonical}
          scopeLabel={scopeLabel}
          onClose={onToggle}
        />
      )}
    </>
  );
}

export function BandVerdictPanel() {
  const { bands, ready, scope, activityScope, dxAvailable } =
    useBandVerdicts();
  const { data: activityByBand } = useBandActivity(activityScope);
  const { data: canonicalByKey } = useBandLadder();
  const dxMode = useVerdictStore((state) => state.dxMode);
  const setDxMode = useVerdictStore((state) => state.setDxMode);
  const [openBand, setOpenBand] = useState<string | null>(null);

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
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="font-orbitron text-xs uppercase tracking-wide text-gray-300">
          Band Health
        </h3>
        <span className="text-[10px] text-white/30">{scope.label}</span>
        {dxAvailable && (
          <button
            type="button"
            onClick={() => setDxMode(!dxMode)}
            aria-pressed={dxMode}
            className={`ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
              dxMode
                ? "border-nebula-blue bg-nebula-blue/10 text-nebula-blue"
                : "border-white/10 text-white/40 hover:text-white/60"
            }`}
          >
            DX
          </button>
        )}
      </div>

      {!ready ? (
        <div className="py-2 text-sm text-gray-500">
          Waiting for solar data…
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {bands.map((entry) => (
            <BandVerdictChip
              key={entry.band}
              entry={entry}
              activity={activityByBand?.get(entry.band)}
              canonical={canonicalFor(entry.band)}
              scopeLabel={scope.label}
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
