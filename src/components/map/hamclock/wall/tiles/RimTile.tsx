import { lazy, Suspense, useMemo, useState } from "react";
import { useRIM } from "@/hooks/useRIM";
import type { RIMResult, RIMSubScore } from "@/types/atmos";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";
import { rimGrade, TONE_STATE } from "../tokens";

const RimReport = lazy(() =>
  import("../reports/RimReport").then((m) => ({ default: m.RimReport })),
);

function worstAvailable(rim: RIMResult): RIMSubScore | null {
  const parts = [
    rim.hfBand,
    rim.vhfUhf,
    rim.infraRisk,
    rim.emcommReadiness,
  ].filter((part) => part.dataAvailable);
  if (parts.length === 0) return null;
  return parts.reduce((low, part) => (part.value < low.value ? part : low));
}

/**
 * Weather-page tile for the Radio Impact Model: composite as the hero,
 * worst available sub-score as the sub line. Opens RimReport.
 */
export function RimTile({ title = "Radio impact" }: WallTileProps) {
  const { rimResult, isLoading } = useRIM();
  const worst = useMemo(
    () => (rimResult ? worstAvailable(rimResult) : null),
    [rimResult],
  );
  const [reportOpen, setReportOpen] = useState(false);

  if (!rimResult) {
    return (
      <HamClockTile title={title} source="RIM">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {isLoading
            ? "Computing radio impact from space and severe weather…"
            : "NO DATA — space weather and severe-weather feeds have not arrived."}
        </p>
      </HamClockTile>
    );
  }

  const available =
    rimResult.hfBand.dataAvailable ||
    rimResult.vhfUhf.dataAvailable ||
    rimResult.infraRisk.dataAvailable ||
    rimResult.emcommReadiness.dataAvailable;

  if (!available) {
    const missing = (rimResult.excludedInputs ?? [])
      .join(", ")
      .toUpperCase();
    return (
      <HamClockTile title={title} source="PARTIAL">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {missing ? `NO DATA — ${missing}` : "NO DATA — RIM inputs unavailable."}
        </p>
      </HamClockTile>
    );
  }

  const { word, tone } = rimGrade(rimResult.composite);
  const hero = Math.round(rimResult.composite).toString();

  return (
    <>
      <HamClockTile
        title={title}
        source={rimResult.partial ? "PARTIAL" : "COMPUTED"}
        state={TONE_STATE[tone]}
        onOpen={() => setReportOpen(true)}
        openLabel={`Radio impact ${hero}, ${word}. Open the radio impact report`}
      >
        <div className="hc-heroline">
          <TileHero tone={tone} flush>
            {hero}
          </TileHero>
          <div className={`hc-verdict hc-glow ${tone}`}>{word}</div>
        </div>
        <TileSub>
          <span>
            {worst
              ? `WORST ${worst.label.toUpperCase()} ${Math.round(worst.value)}`
              : "NO SUB-SCORES AVAILABLE"}
          </span>
          <span>{rimResult.partial ? "PARTIAL" : word}</span>
        </TileSub>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <RimReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
