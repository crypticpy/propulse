import { lazy, Suspense, useMemo, useState } from "react";
import { useRIM } from "@/hooks/useRIM";
import type { RIMResult, RIMSubScore } from "@/types/atmos";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";
import { rimGrade } from "../tokens";

// The report is only worth its bytes once an operator opens it.
const EmcommReport = lazy(() =>
  import("../reports/EmcommReport").then((m) => ({ default: m.EmcommReport })),
);

/** Tone class → the tile's top state-bar colour. */
const TONE_STATE: Record<string, string> = {
  "hc-good": "var(--hc-good)",
  "hc-warn": "var(--hc-warn)",
  "hc-accent-text": "var(--hc-accent)",
  "hc-bad": "var(--hc-bad)",
};

const TREND_ARROW: Record<RIMSubScore["trend"], string> = {
  up: "▲",
  down: "▼",
  stable: "—",
};

/**
 * `RIMSubScore` carries no attribution, so the drag is derived: whichever of
 * the three situational sub-scores sits lowest is what an operator should look
 * at next. The copy says "weakest", not "cause", because that is what the data
 * actually supports.
 */
function weakestLink(rim: RIMResult): RIMSubScore | null {
  const parts = [rim.hfBand, rim.vhfUhf, rim.infraRisk].filter(
    (part) => part.dataAvailable,
  );
  if (parts.length === 0) return null;
  return parts.reduce((low, part) => (part.value < low.value ? part : low));
}

export function EmcommTile({ title = "Emcomm" }: WallTileProps) {
  const { rimResult, isLoading } = useRIM();
  const weakest = useMemo(
    () => (rimResult ? weakestLink(rimResult) : null),
    [rimResult],
  );
  const [reportOpen, setReportOpen] = useState(false);

  if (!rimResult) {
    return (
      <HamClockTile title={title} source="RIM">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {isLoading
            ? "Computing readiness from space and severe weather…"
            : "No space or severe-weather data to score readiness."}
        </p>
      </HamClockTile>
    );
  }

  const score = rimResult.emcommReadiness;

  if (!score.dataAvailable) {
    return (
      <HamClockTile title={title} source="RIM">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">Readiness inputs unavailable right now.</p>
      </HamClockTile>
    );
  }

  const { word, tone } = rimGrade(score.value);

  return (
    <>
      <HamClockTile
        title={title}
        source={`RIM ${Math.round(rimResult.composite)}`}
        state={TONE_STATE[tone]}
        onOpen={() => setReportOpen(true)}
        openLabel={`Emcomm readiness ${Math.round(
          score.value,
        )}, ${word}. Open the emcomm report`}
      >
        <div className="hc-heroline">
          <TileHero tone={tone} flush>
            {Math.round(score.value)}
          </TileHero>
          <div className={`hc-verdict hc-glow ${tone}`}>{word}</div>
        </div>
        <div className={`hcf-meter ${tone}`}>
          <i style={{ width: `${Math.max(0, Math.min(100, score.value))}%` }} />
        </div>
        <TileSub>
          <span>
            {weakest
              ? `WEAKEST ${weakest.label.toUpperCase()} ${Math.round(weakest.value)}`
              : "NO SUB-SCORES AVAILABLE"}
          </span>
          <span>{TREND_ARROW[score.trend]}</span>
        </TileSub>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <EmcommReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
