import { Fragment, lazy, Suspense, useState } from "react";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";
import { getBandColor } from "@/lib/utils/spotColors";
import {
  useWallReliability,
  wallBestBand,
  wallReliabilityScore,
  wallScoreTone,
  WALL_FORECAST_BANDS,
  type WallReliabilityStatus,
} from "./useWallReliability";

// The report is only worth its bytes once an operator opens it.
const ReliabilityReport = lazy(() =>
  import("../reports/ReliabilityReport").then((m) => ({
    default: m.ReliabilityReport,
  })),
);

const IDLE_COPY: Record<Exclude<WallReliabilityStatus, "ready">, string> = {
  "no-station": "Set an operating location to score your paths.",
  "no-target": "Pick a target on the map to score that path.",
  loading: "Loading Kp and solar flux…",
  failed: "Space weather unavailable — nothing to score.",
};

/**
 * Per-band reliability for the current UTC hour of the shared matrix.
 * The hero names the band to call and how good it is; the bars underneath show
 * the rest of the stack at a glance.
 */
export function ReliabilityTile({ title = "24h reliability" }: WallTileProps) {
  const { status, cells, hour, hourIndex, targetLabel, mode } =
    useWallReliability();
  const [reportOpen, setReportOpen] = useState(false);
  const report = reportOpen ? <Suspense fallback={null}><ReliabilityReport open onClose={() => setReportOpen(false)} /></Suspense> : null;

  if (status !== "ready") {
    return (
      <><HamClockTile title={title} onOpen={() => setReportOpen(true)} openLabel="Open reliability report">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {IDLE_COPY[status as Exclude<WallReliabilityStatus, "ready">]}
        </p>
      </HamClockTile>{report}</>
    );
  }

  const best = wallBestBand(cells, hourIndex);
  const tone = best ? wallScoreTone(best.score) : "hc-dim-text";

  return (
    <>
      <HamClockTile
        title={title}
        source={`${mode} · ${String(hour).padStart(2, "0")}Z`}
        state={best && best.score >= 75 ? "var(--hc-good)" : undefined}
        onOpen={() => setReportOpen(true)}
        openLabel={`${
          best ? `${best.band} ${best.score} percent` : "Nothing open"
        } to ${targetLabel}. Open reliability report`}
      >
        <div className="hc-heroline">
          <TileHero tone={tone} flush>
            {best ? best.band.toUpperCase() : "—"}
          </TileHero>
          <div className={`hc-verdict hc-glow ${tone}`}>
            {best ? `${best.score}%` : "SHUT"}
          </div>
        </div>
        <TileSub>
          <span>{best ? "BEST TO" : "NOTHING OPEN TO"}</span>
          <span>{targetLabel.toUpperCase()}</span>
        </TileSub>

        <div className="hcf-bars">
          {WALL_FORECAST_BANDS.map((band) => {
            const score = wallReliabilityScore(cells, band, hourIndex) ?? 0;
            return (
              <Fragment key={band}>
                <span className="hcf-bars-k">{band}</span>
                <span className="hcf-bar">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, score))}%`,
                      color: getBandColor(band),
                    }}
                  />
                </span>
                <span className={`hcf-bars-v ${wallScoreTone(score)}`}>
                  {score}
                </span>
              </Fragment>
            );
          })}
        </div>
      </HamClockTile>

      {report}
    </>
  );
}
