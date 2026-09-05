import { Fragment, useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useKIndex } from "@/hooks/useSolarData";
import { useUTCClock } from "@/hooks/useUTCClock";
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
import { reportTone } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

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
  const { status, cells, hour, targetLabel, mode } = useWallReliability();
  const location = useActiveLocation();
  const sfi = useCurrentSFI();
  const kIndexQuery = useKIndex();
  const timeOffset = useMapStore((state) => state.timeOffset);
  const wallTime = useUTCClock(60_000);

  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index ?? null;

  const muf = useMemo(() => {
    if (!location || sfi == null) return null;
    const at = new Date(wallTime.getTime() + timeOffset * 60 * 60 * 1000);
    return getMUFAtLocation(location.lat, location.lon, sfi, at);
  }, [location, sfi, wallTime, timeOffset]);

  const best = status === "ready" ? wallBestBand(cells, hour) : null;

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

  if (status !== "ready" && !mufReady) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Propagation report · 24h path forecast"
        hero="—"
        verdict="NO PATH"
        facts={facts}
        footer="ITU-R P.533 PHYSICS ENGINE · SAME MATRIX AS THE RAIL"
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
    status === "ready" ? (best ? `${best.score}%` : "SHUT") : IDLE_VERDICT[status];

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
      facts={facts}
      footer="ITU-R P.533 PHYSICS ENGINE · SAME MATRIX AS THE RAIL"
      updated={status === "ready" ? `${String(hour).padStart(2, "0")}Z NOW` : undefined}
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
            {HOURS.map((column) => (
              <span
                key={column}
                className={`hcr-matrix-head${
                  column === hour ? " hcr-matrix-head--now" : ""
                }`}
              >
                {column % 3 === 0 ? String(column).padStart(2, "0") : ""}
              </span>
            ))}
            {WALL_FORECAST_BANDS.map((band) => (
              <Fragment key={band}>
                <span
                  className="hcr-matrix-band"
                  style={{ color: getBandColor(band) }}
                >
                  {band}
                </span>
                {HOURS.map((column) => {
                  const score = wallReliabilityScore(cells, band, column);
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
          <p className="sr-only">
            {WALL_FORECAST_BANDS.map((band) => {
              const score = wallReliabilityScore(cells, band, hour);
              return `${band} now ${score == null ? "no data" : `${score} percent`}`;
            }).join(". ")}
          </p>
        </div>
      ) : (
        <p className="hcr-note">{IDLE_COPY[status]}</p>
      )}
    </WallReport>
  );
}
