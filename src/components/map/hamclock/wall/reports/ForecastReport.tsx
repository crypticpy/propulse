import { Fragment, useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useKIndex } from "@/hooks/useSolarData";
import { useMapDisplayTime } from "@/hooks/useUTCClock";
import { getMUFAtLocation } from "@/lib/api/muf";
import { getBandColor } from "@/lib/utils/spotColors";
import { useMapStore } from "@/stores/mapStore";
import {
  useWallReliability,
  wallBestBand,
  wallReliabilityScore,
  wallScoreTone,
  WALL_FORECAST_BANDS,
  type WallReliabilityStatus,
} from "../tiles/useWallReliability";
import { reportTone, reportFooter } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";
import { SolarMiniChart } from "@/components/solar/SolarMiniChart";
import {
  FUTURECAST_HORIZONS_HOURS,
  propagationFutureCastHorizonIsActivated,
} from "@/lib/propagation/runtimeActivation";

/** Which tile opened the report; it only chooses the hero. */
export type ForecastFocus = "forecast" | "reliability" | "muf";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const IDLE_COPY: Record<Exclude<WallReliabilityStatus, "ready">, string> = {
  "no-station": "Set an operating location to forecast your paths.",
  "no-target": "Pick a target on the map to forecast that path.",
  loading: "Loading Kp and solar flux…",
  failed: "Space weather unavailable — no forecast to draw.",
};

/** Short verdict word for the idle statuses, in place of a reliability score. */
const IDLE_VERDICT: Record<Exclude<WallReliabilityStatus, "ready">, string> = {
  "no-station": "NO QTH",
  "no-target": "NO TARGET",
  loading: "LOADING",
  failed: "NO DATA",
};

export interface ForecastReportProps {
  open: boolean;
  onClose: () => void;
  focus: ForecastFocus;
}

/**
 * The path report behind the forecast matrix, reliability and MUF tiles: the
 * band to call now, the physics inputs behind that call, and the whole 24-hour
 * matrix at a size that reads from the far side of the room. Every score is
 * the shared `useWallReliability` matrix, so the report and the rail can never
 * disagree.
 */
export function ForecastReport({ open, onClose, focus }: ForecastReportProps) {
  const { status, cells, hour, hourIndex, targetLabel, mode } =
    useWallReliability();
  const location = useActiveLocation();
  const sfi = useCurrentSFI();
  const kIndexQuery = useKIndex();
  const timeOffset = useMapStore((state) => state.timeOffset);
  const absoluteTime = useMapStore((state) => state.absoluteTime);
  // Same derivation `useWallReliability` uses, so the MUF instant and the
  // matrix it sits beside always describe the same moment.
  const displayTime = useMapDisplayTime(timeOffset, absoluteTime, 60_000);

  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index ?? null;

  const muf = useMemo(() => {
    if (!location || sfi == null) return null;
    return getMUFAtLocation(location.lat, location.lon, sfi, displayTime);
  }, [location, sfi, displayTime]);

  // `cells` is keyed by absolute `hourIndex` (whole UTC hours since epoch),
  // not the 0–23 clock hour, so the hero and matrix must look up by that key.
  const dayStartIndex = hourIndex - hour;
  const best = status === "ready" ? wallBestBand(cells, hourIndex) : null;

  const facts: WallReportFact[] = [
    { label: "MUF", value: muf === null ? "—" : `${muf.toFixed(1)} MHz` },
    { label: "SFI", value: sfi == null ? "—" : Math.round(sfi) },
    { label: "Kp", value: kp === null ? "—" : kp.toFixed(1) },
    { label: "TARGET", value: targetLabel.toUpperCase() },
    { label: "MODE", value: mode },
    { label: "HOUR", value: `${String(hour).padStart(2, "0")}Z` },
  ];

  // The MUF only needs a QTH and SFI, not a DX target, so a `muf`-focused open
  // can render its hero and facts even while the reliability matrix (which
  // does need a target) is idle. The matrix body still falls back to the
  // idle note, since that half of the report genuinely has nothing to draw.
  const mufReady = focus === "muf" && muf !== null;

  // HW-17: FutureCast model horizons are activated per a signed runtime
  // manifest (see runtimeActivation.ts); when none are active the matrix and
  // facts render exactly as before — no new data feed, only an overlay on
  // the existing physics hours that correspond to an activated offset.
  const activatedHorizons = FUTURECAST_HORIZONS_HOURS.filter((horizon) =>
    propagationFutureCastHorizonIsActivated(horizon),
  );
  const idleFooter = reportFooter(
    "ITU-R P.533 PHYSICS ENGINE · SAME MATRIX AS THE RAIL",
    null,
  );

  if (status !== "ready" && !mufReady) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Propagation report · 24h path forecast"
        hero="—"
        verdict="NO PATH"
        facts={facts}
        footer={idleFooter.footer}
        updated={idleFooter.updated}
      >
        <p className="hcr-note">{IDLE_COPY[status]}</p>
      </WallReport>
    );
  }

  const toneClass = best ? wallScoreTone(best.score) : "hc-dim-text";
  const hero =
    focus === "muf" && muf !== null ? (
      <>
        {muf.toFixed(1)}
        <span className="hcr-unit">MHz</span>
      </>
    ) : (
      (best?.band.toUpperCase() ?? "—")
    );
  const verdict =
    status === "ready"
      ? best
        ? `${best.score}%`
        : "SHUT"
      : IDLE_VERDICT[status];

  const { footer, updated } = reportFooter(
    "ITU-R P.533 PHYSICS ENGINE · SAME MATRIX AS THE RAIL",
    status === "ready" ? Date.now() : null,
  );

  // 24h MUF trend across the same hours the matrix already covers, at the
  // report's own QTH/SFI — no new feed, just the existing physics call swept
  // across the day instead of evaluated once for the hero.
  const mufChart =
    location && sfi != null
      ? HOURS.map((column) => {
          const at = new Date(displayTime);
          at.setUTCHours(at.getUTCHours() - hour + column, 0, 0, 0);
          return {
            timestamp: at.toISOString(),
            value: getMUFAtLocation(location.lat, location.lon, sfi, at),
          };
        })
      : [];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={
        status === "ready"
          ? `Propagation report · ${targetLabel} · ${mode}`
          : "Propagation report · 24h path forecast"
      }
      tone={reportTone(toneClass)}
      hero={hero}
      verdict={verdict}
      facts={
        activatedHorizons.length
          ? [
              ...facts,
              {
                label: "MODEL",
                value: `+${activatedHorizons.join("H, +")}H HORIZONS`,
              },
            ]
          : facts
      }
      footer={footer}
      updated={updated}
      pinId={`forecast-${focus}`}
      pinElement={<ForecastReport open onClose={onClose} focus={focus} />}
    >
      {status === "ready" ? (
        <div className="hcr-box">
          <h4>24h reliability · band × UTC hour</h4>
          <div
            className="hcr-matrix"
            style={{ gridTemplateColumns: "4vw repeat(24, 1fr)" }}
            aria-hidden="true"
          >
            <span />
            {HOURS.map((column) => {
              const isModelHour = activatedHorizons.some(
                (horizon) => (hour + horizon) % 24 === column,
              );
              return (
                <span
                  key={column}
                  className={`hcr-matrix-head${
                    column === hour ? " hcr-matrix-head--now" : ""
                  }${isModelHour ? " hcr-matrix-head--model" : ""}`}
                >
                  {column % 3 === 0 ? String(column).padStart(2, "0") : ""}
                </span>
              );
            })}
            {WALL_FORECAST_BANDS.map((band) => (
              <Fragment key={band}>
                <span
                  className="hcr-matrix-band"
                  style={{ color: getBandColor(band) }}
                >
                  {band}
                </span>
                {HOURS.map((column) => {
                  const score = wallReliabilityScore(
                    cells,
                    band,
                    dayStartIndex + column,
                  );
                  const dead = score == null || score <= 0;
                  return (
                    <span
                      key={column}
                      className={`hcf-dot ${wallScoreTone(score)}${
                        dead ? " hcf-dot--off" : ""
                      }`}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
          {/* The visual matrix above is decorative (`aria-hidden`); this table
              is the one assistive tech actually reads, so every cell — not
              just the current hour — needs to be reachable. */}
          <table className="sr-only">
            <caption>24 hour reliability by band, UTC</caption>
            <thead>
              <tr>
                <th scope="col">Band</th>
                {HOURS.map((column) => {
                  const isModelHour = activatedHorizons.some(
                    (horizon) => (hour + horizon) % 24 === column,
                  );
                  return (
                    <th key={column} scope="col">
                      {`${String(column).padStart(2, "0")}Z${isModelHour ? " (model)" : ""}`}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {WALL_FORECAST_BANDS.map((band) => (
                <tr key={band}>
                  <th scope="row">{band}</th>
                  {HOURS.map((column) => {
                    const score = wallReliabilityScore(
                      cells,
                      band,
                      dayStartIndex + column,
                    );
                    return (
                      <td key={column}>
                        {score == null || score <= 0 ? "shut" : `${score}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hcr-note">{IDLE_COPY[status]}</p>
      )}
      {mufChart.length > 0 && (
        <div className="hcr-chart">
          <SolarMiniChart
            label="MUF — 24 H · ITU-R P.533"
            points={mufChart}
            unit="MHz"
            maxGapMs={2 * 60 * 60 * 1000}
          />
        </div>
      )}
    </WallReport>
  );
}
