import { Fragment, lazy, Suspense, useMemo, useState } from "react";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";
import {
  useWallReliability,
  wallBestBand,
  wallReliabilityScore,
  wallScoreTone,
  WALL_FORECAST_BANDS,
  type WallForecastBand,
  type WallReliabilityStatus,
} from "./useWallReliability";
import type { ReliabilityCell } from "@/lib/hamclock/reliabilityForecast";

// The report is only worth its bytes once an operator opens it.
const ForecastReport = lazy(() =>
  import("../reports/ForecastReport").then((m) => ({
    default: m.ForecastReport,
  })),
);

/**
 * Columns the matrix shows.
 *
 * The approved mock draws a three-day matrix, but the only multi-day
 * band-condition source this app has is FutureCast, whose horizons top out at
 * 24 hours (`FUTURECAST_HORIZONS_HOURS = [3, 6, 12, 24]`) and which is
 * currently disabled at the data layer. Rather than invent two days of data,
 * the wall samples the real physics matrix at four points and names the
 * horizon in its title. The matrix runs 48 hours so every offset below reads a
 * genuinely future hour even late in the UTC day.
 */
const COLUMNS = [
  { offset: 0, label: "NOW" },
  { offset: 6, label: "+6H" },
  { offset: 12, label: "+12H" },
  { offset: 18, label: "+18H" },
] as const;

/** Score at which a band counts as genuinely open, matching the desk tiers. */
const OPEN = 75;
/** Score below which a band is not worth calling. */
const SHUT = 50;

const IDLE_COPY: Record<Exclude<WallReliabilityStatus, "ready">, string> = {
  "no-station": "Set an operating location to forecast your paths.",
  "no-target": "Pick a target on the map to forecast that path.",
  loading: "Loading Kp and solar flux…",
  failed: "Space weather unavailable — no forecast to draw.",
};

function tierWord(score: number | null): string {
  if (score == null) return "no data";
  if (score >= OPEN) return "open";
  if (score >= SHUT) return "workable";
  if (score >= 25) return "marginal";
  if (score > 0) return "weak";
  return "closed";
}

interface Headline {
  band: string;
  verdict: string;
  tone: string;
  detail: string;
}

/**
 * The one sentence worth reading from ten feet: the next band that opens. A
 * band qualifies when it is not workable now and reaches `OPEN` later; the
 * earliest column wins, and within a column the highest frequency wins because
 * that is the more newsworthy opening.
 */
function findOpening(
  cells: Map<string, ReliabilityCell>,
  hourIndex: number,
): Headline | null {
  for (const column of COLUMNS) {
    if (column.offset === 0) continue;
    let pick: WallForecastBand | null = null;
    for (const band of WALL_FORECAST_BANDS) {
      const now = wallReliabilityScore(cells, band, hourIndex);
      const later = wallReliabilityScore(
        cells,
        band,
        hourIndex + column.offset,
      );
      if (now == null || later == null) continue;
      if (now >= SHUT || later < OPEN) continue;
      // WALL_FORECAST_BANDS runs low to high, so a later hit outranks.
      pick = band;
    }
    if (pick) {
      const nowWord = tierWord(wallReliabilityScore(cells, pick, hourIndex));
      return {
        band: pick.toUpperCase(),
        verdict: "OPENS",
        tone: "hc-good",
        detail: `IN ${column.offset}H · NOW ${nowWord.toUpperCase()}`,
      };
    }
  }
  return null;
}

/**
 * Band × horizon dot matrix. Every dot is a real physics score for that band
 * at that UTC hour, so the grid and the hero can never disagree.
 */
export function ForecastMatrixTile({
  title = "24h band forecast",
}: WallTileProps) {
  const { status, cells, hourIndex, targetLabel, mode } = useWallReliability();
  const [reportOpen, setReportOpen] = useState(false);

  const hero = useMemo<Headline | null>(() => {
    if (status !== "ready") return null;
    const opening = findOpening(cells, hourIndex);
    if (opening) return opening;
    const best = wallBestBand(cells, hourIndex);
    return {
      band: best ? best.band.toUpperCase() : "—",
      verdict: best ? "STEADY" : "SHUT",
      tone: best ? wallScoreTone(best.score) : "hc-dim-text",
      detail: best ? "NO NEW OPENINGS IN 18H" : "NO BAND WORKABLE IN 18H",
    };
  }, [status, cells, hourIndex]);

  if (status !== "ready" || !hero) {
    return (
      <HamClockTile title={title}>
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {IDLE_COPY[status as Exclude<WallReliabilityStatus, "ready">]}
        </p>
      </HamClockTile>
    );
  }

  const summary = WALL_FORECAST_BANDS.map((band) =>
    COLUMNS.map(
      (column) =>
        `${band} ${column.label} ${tierWord(
          wallReliabilityScore(cells, band, hourIndex + column.offset),
        )}`,
    ).join(", "),
  ).join(". ");

  return (
    <>
      <HamClockTile
        title={title}
        source={`${mode} · ${targetLabel.toUpperCase()}`}
        state={hero.verdict === "OPENS" ? "var(--hc-good)" : undefined}
        onOpen={() => setReportOpen(true)}
        openLabel={`${hero.band} ${hero.verdict}. Open the propagation report`}
      >
        <div className="hc-heroline">
          <TileHero tone={hero.tone} flush>
            {hero.band}
          </TileHero>
          <div className={`hc-verdict hc-glow ${hero.tone}`}>{hero.verdict}</div>
        </div>
        <TileSub>
          <span>{hero.detail}</span>
        </TileSub>

        <div
          className="hcf-matrix"
          style={{ gridTemplateColumns: `2.8vw repeat(${COLUMNS.length}, 1fr)` }}
          aria-hidden="true"
        >
          <span className="hcf-matrix-corner" />
          {COLUMNS.map((column) => (
            <span
              key={column.label}
              className={`hcf-matrix-head${
                column.offset === 0 ? " hcf-matrix-head--now" : ""
              }`}
            >
              {column.label}
            </span>
          ))}
          {WALL_FORECAST_BANDS.map((band) => (
            <Fragment key={band}>
              <span className="hcf-matrix-band">{band}</span>
              {COLUMNS.map((column) => {
                const score = wallReliabilityScore(
                  cells,
                  band,
                  hourIndex + column.offset,
                );
                const dead = score == null || score <= 0;
                return (
                  <span
                    key={column.label}
                    className={`hcf-dot ${wallScoreTone(score)}${
                      dead ? " hcf-dot--off" : ""
                    }`}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        <p className="sr-only">{summary}</p>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <ForecastReport
            open
            onClose={() => setReportOpen(false)}
            focus="forecast"
          />
        </Suspense>
      )}
    </>
  );
}
