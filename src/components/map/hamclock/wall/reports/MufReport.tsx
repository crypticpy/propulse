import { useId, useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useCurrentSFI, useMUFHourlySeries } from "@/hooks/useMUFData";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useNowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import {
  getFrequencyLimits,
  getMUFAtLocation,
  topUsableBand,
  type MUFSeriesPoint,
} from "@/lib/api/muf";
import { BAND_ORDER, BAND_RANGES } from "@/lib/data/bandRanges";
import { HF_MODEL_BANDS } from "@/lib/propagation/coreFeatureBuilder";
import {
  calculateDLayerAbsorption,
  describeConditions,
  getIonosphericParameters,
} from "@/lib/utils/ionosphere";
import {
  hopElevationAngle,
  traceRayPath,
  type RayTraceResult,
} from "@/lib/utils/rayTrace";
import { latLonToGrid } from "@/lib/utils/grid";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import type { EngineReading } from "@/lib/hamclock/engineComparison";
import {
  bandFrequencyStepClassifier,
  ladderStepVerdict,
} from "@/lib/hamclock/engineComparison";
import { HamClockTabs } from "../controls/HamClockTabs";
import { reportFooter } from "../tokens";
import { EngineComparisonStrip } from "./EngineComparisonStrip";
import { WallReport, type WallReportFact } from "./WallReport";

export interface MufReportProps {
  open: boolean;
  onClose: () => void;
}

const FALLBACK_KP = 2;
/** NOAA solar flux is normally reissued every ~3 h; twice that with no
 * refresh is a stale feed, not just a slow tick. */
const SFI_STALE_HOURS = 6;

const CHART_LEFT = 32;
const CHART_RIGHT = 284;
const CHART_TOP = 12;
const CHART_BOTTOM = 66;

/**
 * `MUF — 24 H · P.533 AT QTH`: the MUF line over a shaded FOT/LUF usable
 * window. `SolarMiniChart` cannot paint a filled band, so this report draws
 * its own small inline SVG, following the same CSS-token-only colour
 * contract (`--hcr-chart-*`, hex fallback) `SolarMiniChart` established.
 * Decorative only — the `sr-only` table alongside it is the accessible twin.
 */
function UsableWindowChart({
  points,
  now,
  staleFromMs,
}: {
  points: MUFSeriesPoint[];
  now: Date;
  staleFromMs: number | null;
}) {
  const id = useId();
  const rows = points
    .map((point) => ({ ...point, time: Date.parse(point.timestamp) }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  if (rows.length < 2) return null;

  const start = rows[0].time;
  const end = rows[rows.length - 1].time;
  if (end <= start) return null;

  const low = Math.min(...rows.map((row) => row.luf));
  const high = Math.max(...rows.map((row) => row.muf));
  const spread = high - low || 1;
  const x = (t: number) =>
    CHART_LEFT + ((CHART_RIGHT - CHART_LEFT) * (t - start)) / (end - start);
  const y = (v: number) =>
    CHART_BOTTOM - ((CHART_BOTTOM - CHART_TOP) * (v - low)) / spread;

  const bandPath = [
    ...rows.map(
      (row, i) => `${i === 0 ? "M" : "L"}${x(row.time)},${y(row.fot)}`,
    ),
    ...[...rows].reverse().map((row) => `L${x(row.time)},${y(row.luf)}`),
    "Z",
  ].join(" ");

  const dimIndex =
    staleFromMs == null ? -1 : rows.findIndex((row) => row.time >= staleFromMs);
  const mufSegment = (from: number, to: number) =>
    rows
      .slice(from, to)
      .map(
        (row, i) =>
          `${i === 0 ? "M" : "L"}${x(row.time).toFixed(2)},${y(row.muf).toFixed(2)}`,
      )
      .join(" ");
  const mufFreshPath = mufSegment(
    0,
    dimIndex === -1 ? rows.length : dimIndex + 1,
  );
  const mufDimPath = dimIndex === -1 ? "" : mufSegment(dimIndex, rows.length);

  const hourTicks = rows.filter(
    (row) => new Date(row.time).getUTCHours() % 6 === 0,
  );
  const nowMs = now.getTime();
  const showNowMarker = nowMs >= start && nowMs <= end;

  return (
    <div className="hcr-chart">
      <p className="hcr-chart-title">MUF — 24 H · P.533 AT QTH</p>
      <svg viewBox="0 0 300 88" role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>
          MUF, FOT and LUF at QTH over the last 24 hours
        </title>
        <path
          d={bandPath}
          fill="var(--hcr-chart-dim, #64748b)"
          fillOpacity="0.25"
          stroke="none"
        />
        {mufFreshPath && (
          <path
            d={mufFreshPath}
            fill="none"
            stroke="var(--hcr-chart-observed, #44ddff)"
            strokeWidth="2"
          />
        )}
        {mufDimPath && (
          <path
            d={mufDimPath}
            fill="none"
            stroke="var(--hcr-chart-dim, #64748b)"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        )}
        {showNowMarker && (
          <line
            x1={x(nowMs)}
            x2={x(nowMs)}
            y1={CHART_TOP}
            y2={CHART_BOTTOM}
            stroke="var(--hcr-chart-now, #f8fafc)"
            strokeDasharray="2 2"
          />
        )}
        <text x="0" y="16" fill="var(--hcr-chart-dim, #94a3b8)" fontSize="9">
          {high.toFixed(0)}
        </text>
        <text x="0" y="67" fill="var(--hcr-chart-dim, #94a3b8)" fontSize="9">
          {low.toFixed(0)}
        </text>
        {hourTicks.map((tick) => (
          <text
            key={tick.time}
            x={x(tick.time)}
            y="82"
            textAnchor="middle"
            fill="var(--hcr-chart-dim, #94a3b8)"
            fontSize="8"
          >
            {String(new Date(tick.time).getUTCHours()).padStart(2, "0")}Z
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>MUF, FOT and LUF by hour, P.533 at QTH</caption>
        <thead>
          <tr>
            <th scope="col">Hour (UTC)</th>
            <th scope="col">MUF</th>
            <th scope="col">FOT</th>
            <th scope="col">LUF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.time}>
              <td>{new Date(row.time).toISOString().slice(11, 16)}</td>
              <td>{row.muf.toFixed(1)} MHz</td>
              <td>{row.fot.toFixed(1)} MHz</td>
              <td>{row.luf.toFixed(1)} MHz</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** MUF-report tracing never lets a physics edge case crash the dialog — an
 * unreachable path reads "NO PATH" instead of throwing. */
function safeTrace(
  args: Parameters<typeof traceRayPath>[0],
): RayTraceResult | null {
  try {
    return traceRayPath(args);
  } catch {
    return null;
  }
}

/** Highest HF_MODEL_BANDS band NowCast rates above 50% for this path, taken
 * as the model's implied top usable band — the same "top band" question the
 * physics column answers, from an independent source. */
function nowcastImpliedBand(
  predictions: Map<
    string,
    {
      core_probability: number;
      personalized_probability: number;
      confidence: number;
    }
  >,
  personalized: boolean,
): { band: string; pct: number; confidence: number } | null {
  let best: { band: string; pct: number; confidence: number } | null = null;
  for (const band of HF_MODEL_BANDS) {
    const prediction = predictions.get(band);
    if (!prediction) continue;
    const pct =
      (personalized
        ? prediction.personalized_probability
        : prediction.core_probability) * 100;
    if (pct < 50) continue;
    best = { band, pct, confidence: prediction.confidence * 100 };
  }
  return best;
}

/**
 * The MUF tile's drill-down: the ionosphere at the operator's QTH, the three
 * engines' agreement on the top usable band, and — once a target is set on
 * the map — every hop of the ray trace to that target, each one a click away
 * from being marked on the map.
 */
export function MufReport({ open, onClose }: MufReportProps) {
  const location = useActiveLocation();
  const sfi = useCurrentSFI();
  const now = useUTCClock(60_000);
  const timeOffset = useMapStore((s) => s.timeOffset);
  const target = useMapStore((s) => s.target);
  const setCenterLocation = useMapStore((s) => s.setCenterLocation);
  const setFlashPoint = useMapStore((s) => s.setFlashPoint);
  const reliability = useHamClockStore((s) => s.reliability);
  const kIndexQuery = useKIndex();
  const currentKp =
    kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index ?? null;
  const solarFluxQuery = useSolarFlux();
  const stationCast = useStationCastContext();
  const { bands: ladderBands, ready: ladderReady } = useBandVerdicts();

  const sfiUpdatedAt = solarFluxQuery.dataUpdatedAt || null;
  const sfiStale =
    sfiUpdatedAt != null &&
    now.getTime() - sfiUpdatedAt > SFI_STALE_HOURS * 60 * 60 * 1000;

  const at = useMemo(
    () => new Date(now.getTime() + timeOffset * 60 * 60 * 1000),
    [now, timeOffset],
  );

  const muf = useMemo(() => {
    if (!location || sfi == null) return null;
    return getMUFAtLocation(location.lat, location.lon, sfi, at);
  }, [location, sfi, at]);

  const band = muf === null ? "—" : topUsableBand(muf);

  const limits = useMemo(() => {
    if (!location || sfi == null) return null;
    return getFrequencyLimits(
      location.lat,
      location.lon,
      sfi,
      at,
      reliability.powerWatts,
      reliability.mode,
    );
  }, [location, sfi, at, reliability.powerWatts, reliability.mode]);

  const ionosphere = useMemo(() => {
    if (!location || sfi == null) return null;
    return getIonosphericParameters(location.lat, location.lon, at, sfi);
  }, [location, sfi, at]);

  const chartPoints = useMUFHourlySeries(location, at);

  const nowCastTarget = useMemo(() => {
    if (!target) return null;
    try {
      return {
        grid: target.grid ?? latLonToGrid(target.lat, target.lon, 4),
        lat: target.lat,
        lon: target.lon,
      };
    } catch {
      return null;
    }
  }, [target]);
  const nowCast = useNowCastBandPredictions({
    origin: stationCast.location,
    target: nowCastTarget,
    weather: {
      ...(currentKp == null ? {} : { kp: currentKp }),
      ...(sfi == null ? {} : { f107: sfi }),
    },
    mode: reliability.mode,
    deriveEnvelope: stationCast.deriveEnvelope,
  });

  // Derived independently from the physics-implied `band`: the observed
  // engine reports the highest ladder band that actually has recent spot
  // activity, so a physics/observed split is never masked by looking up the
  // physics band's own (possibly zero-activity) ladder entry.
  const observedEntry = useMemo(() => {
    if (!ladderReady) return null;
    let best: (typeof ladderBands)[number] | null = null;
    for (const bandKey of BAND_ORDER) {
      const entry = ladderBands.find((e) => e.band === bandKey);
      if (entry && entry.result.inputs.obs20m > 0) {
        // BAND_ORDER runs low-to-high, so the last match found is the
        // highest band with recent activity.
        best = entry;
      }
    }
    return best;
  }, [ladderReady, ladderBands]);

  const engineSubject = band === "—" ? "HF" : band.toUpperCase();
  const classify = useMemo(
    () => bandFrequencyStepClassifier(band === "—" ? "20m" : band, 2),
    [band],
  );

  const physicsReading: EngineReading = useMemo(() => {
    if (muf === null || limits === null) {
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    }
    return {
      value: `${muf.toFixed(1)} MHz`,
      comparable: { kind: "number", value: muf, unit: "MHz" },
      detail: `FOT ${limits.fot.toFixed(1)} · LUF ${limits.luf.toFixed(1)} MHz`,
      updatedAt: sfiUpdatedAt != null ? new Date(sfiUpdatedAt) : at,
      state: sfiStale ? "stale" : "ok",
    };
  }, [muf, limits, at, sfiUpdatedAt, sfiStale]);

  // A live engine cannot answer for a "now" the map's time machine has moved
  // away from real time -- comparing it against the time-shifted physics
  // reading would compare two different instants and read a false verdict.
  const timeShifted = timeOffset !== 0;

  const nowcastReading: EngineReading = useMemo(() => {
    if (timeShifted) {
      return {
        value: "—",
        comparable: { kind: "none" },
        state: "unavailable",
        unavailableReason: "TIME SHIFTED",
      };
    }
    if (!nowCast.available || nowCast.predictions.size === 0) {
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    }
    const implied = nowcastImpliedBand(
      nowCast.predictions,
      nowCast.personalized,
    );
    if (!implied) {
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    }
    const impliedMhz = BAND_RANGES[implied.band].startKHz / 1000;
    return {
      value: `${impliedMhz.toFixed(1)} MHz`,
      comparable: { kind: "number", value: impliedMhz, unit: "MHz" },
      detail: `${implied.band.toUpperCase()} @ ${Math.round(implied.pct)}%`,
      confidence: implied.confidence,
      state: nowCast.pending ? "stale" : "ok",
    };
  }, [timeShifted, nowCast]);

  const observedReading: EngineReading = useMemo(() => {
    if (timeShifted) {
      return {
        value: "—",
        comparable: { kind: "none" },
        state: "unavailable",
        unavailableReason: "TIME SHIFTED",
      };
    }
    if (!ladderReady || !observedEntry) {
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    }
    return {
      value: `${observedEntry.result.inputs.obs20m} OBS/20 MIN`,
      comparable: {
        kind: "verdict",
        verdict: ladderStepVerdict(observedEntry.stable),
      },
      detail: `${observedEntry.result.counts?.sourceCounts60m.dxcluster ?? 0}·${
        observedEntry.result.counts?.sourceCounts60m.rbn ?? 0
      } DX·RBN`,
      state: "ok",
    };
  }, [timeShifted, ladderReady, observedEntry]);

  const rayTrace = useMemo(() => {
    if (!location || !target || muf === null || limits === null) return null;
    return safeTrace({
      startLat: location.lat,
      startLon: location.lon,
      endLat: target.lat,
      endLon: target.lon,
      frequencyMHz: limits.fot,
      date: at,
      sfi: sfi ?? 100,
      kp: currentKp ?? FALLBACK_KP,
    });
  }, [location, target, muf, limits, at, sfi, currentKp]);

  // QTH-only ionosphere diagnostics (spec §26.2's PATH facts) -- vertical
  // D-layer absorption at the QTH point, using the same MUF/FOT frequency the
  // headline reading already uses.
  const dLayerAbsorptionDb =
    ionosphere && sfi != null
      ? calculateDLayerAbsorption(
          muf ?? limits?.fot ?? 0,
          ionosphere.zenithAngle,
          sfi,
          90,
        )
      : null;

  // Path diagnostics need a target and a viable trace; both read "SET
  // TARGET" / "—" rather than a fabricated number when either is missing.
  const midpointHop = rayTrace
    ? rayTrace.hops.reduce((closest, hop) =>
        Math.abs(hop.reflectionPoint.fractionAlongPath - 0.5) <
        Math.abs(closest.reflectionPoint.fractionAlongPath - 0.5)
          ? hop
          : closest,
      )
    : null;
  const takeoffAngleDeg = rayTrace
    ? hopElevationAngle(
        rayTrace.totalDistanceKm / rayTrace.hops.length,
        rayTrace.hops[0].hmF2,
      )
    : null;
  const limitingHopReason = rayTrace
    ? rayTrace.isPathViable
      ? "lowest-quality hop"
      : "exceeds MUF"
    : null;

  const facts: WallReportFact[] = [
    {
      label: "FOT",
      value: limits === null ? "—" : `${limits.fot.toFixed(1)} MHz`,
    },
    {
      label: "LUF",
      value: limits === null ? "—" : `${limits.luf.toFixed(1)} MHz`,
    },
    { label: "SFI", value: sfi == null ? "—" : Math.round(sfi) },
    { label: "MODE", value: reliability.mode },
    { label: "HOUR", value: `${String(at.getUTCHours()).padStart(2, "0")}Z` },
  ];

  const { footer, updated } = reportFooter(
    "P.533-STYLE PHYSICS MODEL · QTH POINT ESTIMATE",
    location && sfi != null ? at : null,
  );

  if (!location || sfi == null) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="MUF report · path detail"
        hero="—"
        verdict="NO DATA"
        footer={footer}
        updated={updated}
      >
        <p className="hcr-note">
          {location ? "Waiting for solar flux…" : "SET HOME IN SETTINGS"}
        </p>
      </WallReport>
    );
  }

  const pathTab = (
    <div className="hcr-box">
      <h4>Ionosphere at QTH</h4>
      <dl className="hcr-kv">
        <dt>Critical frequency f0F2</dt>
        <dd>{ionosphere ? `${ionosphere.f0F2.toFixed(1)} MHz` : "—"}</dd>
        <dt>F2 layer height hmF2</dt>
        <dd>{ionosphere ? `${Math.round(ionosphere.hmF2)} km` : "—"}</dd>
        <dt>Geomagnetic latitude</dt>
        <dd>
          {ionosphere?.geomagneticLatitude != null
            ? `${ionosphere.geomagneticLatitude.toFixed(1)}°`
            : "—"}
        </dd>
        <dt>Side</dt>
        <dd>
          {ionosphere ? (ionosphere.isDaytime ? "DAYSIDE" : "NIGHTSIDE") : "—"}
        </dd>
        <dt>M(3000)F2</dt>
        <dd>{ionosphere ? ionosphere.m3000F2.toFixed(2) : "—"}</dd>
        <dt>D-layer absorption</dt>
        <dd>
          {dLayerAbsorptionDb == null
            ? "—"
            : `${dLayerAbsorptionDb.toFixed(1)} dB`}
        </dd>
        <dt>Solar zenith angle</dt>
        <dd>{ionosphere ? `${ionosphere.zenithAngle.toFixed(1)}°` : "—"}</dd>
        <dt>Day/night at midpoint</dt>
        <dd>
          {!target
            ? "SET TARGET"
            : midpointHop
              ? midpointHop.reflectionPoint.isDaytime
                ? "DAYSIDE"
                : "NIGHTSIDE"
              : "—"}
        </dd>
        <dt>Take-off angle</dt>
        <dd>
          {!target
            ? "SET TARGET"
            : takeoffAngleDeg == null
              ? "—"
              : `${takeoffAngleDeg.toFixed(1)}°`}
        </dd>
        <dt>Hop count</dt>
        <dd>{!target ? "SET TARGET" : (rayTrace?.hops.length ?? "—")}</dd>
        <dt>Total path loss</dt>
        <dd>
          {!target
            ? "SET TARGET"
            : rayTrace
              ? `${rayTrace.totalPathLossDb.toFixed(1)} dB`
              : "—"}
        </dd>
        <dt>Limiting hop</dt>
        <dd>
          {!target
            ? "SET TARGET"
            : rayTrace
              ? `#${rayTrace.limitingHop + 1} · ${limitingHopReason}`
              : "—"}
        </dd>
      </dl>
      <p className="hcr-note">
        {ionosphere
          ? describeConditions(ionosphere)
          : "Waiting for ionosphere inputs…"}
      </p>
      {chartPoints && chartPoints.length > 0 && (
        <UsableWindowChart
          points={chartPoints}
          now={now}
          staleFromMs={sfiStale ? sfiUpdatedAt : null}
        />
      )}
    </div>
  );

  const hopsTab = !target ? (
    <p className="hcr-note">Pick a target on the map to trace a path.</p>
  ) : !rayTrace ? (
    <p className="hcr-note">No viable ray trace for this path right now.</p>
  ) : (
    <div className="hcr-box">
      <p className="hcr-bandtable-caption">
        {rayTrace.hops.length} hop{rayTrace.hops.length === 1 ? "" : "s"} ·{" "}
        {rayTrace.summary}
      </p>
      <div className="hcr-hoptable-head" aria-hidden="true">
        <span>#</span>
        <span>Reflection point</span>
        <span>MUF</span>
        <span>Absorption</span>
        <span>Score</span>
      </div>
      <div className="hcr-bandtable">
        {rayTrace.hops.map((hop, index) => (
          <button
            key={index}
            type="button"
            className="hcr-hoprow"
            onClick={() => {
              setCenterLocation(
                hop.reflectionPoint.lat,
                hop.reflectionPoint.lon,
              );
              // Camera recentering alone leaves no visible trace of which
              // point was picked — flash a momentary marker there too.
              setFlashPoint(hop.reflectionPoint.lat, hop.reflectionPoint.lon);
            }}
          >
            <span>{index + 1}</span>
            <span>
              {hop.reflectionPoint.lat.toFixed(1)}°,{" "}
              {hop.reflectionPoint.lon.toFixed(1)}°
            </span>
            <span className={hop.isFrequencySupported ? "hc-good" : "hc-bad"}>
              {hop.muf.toFixed(1)} MHz
            </span>
            <span>{hop.absorptionDb.toFixed(1)} dB</span>
            <span className={index === rayTrace.limitingHop ? "hc-warn" : ""}>
              {Math.round(hop.qualityScore)}
            </span>
          </button>
        ))}
      </div>
      <table className="sr-only">
        <caption>Ray trace hops to target</caption>
        <thead>
          <tr>
            <th scope="col">Hop</th>
            <th scope="col">Reflection latitude</th>
            <th scope="col">Reflection longitude</th>
            <th scope="col">Hop MUF</th>
            <th scope="col">Absorption</th>
            <th scope="col">Quality score</th>
          </tr>
        </thead>
        <tbody>
          {rayTrace.hops.map((hop, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{hop.reflectionPoint.lat.toFixed(2)}</td>
              <td>{hop.reflectionPoint.lon.toFixed(2)}</td>
              <td>{hop.muf.toFixed(1)} MHz</td>
              <td>{hop.absorptionDb.toFixed(1)} dB</td>
              <td>{Math.round(hop.qualityScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`MUF report · ${engineSubject} at QTH`}
      tone={band === "—" ? "info" : "good"}
      hero={
        <>
          {muf === null ? "—" : muf.toFixed(1)}
          <span className="hcr-unit">MHz</span>
        </>
      }
      verdict={band === "—" ? "NO HF" : band.toUpperCase()}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="muf"
      pinElement={<MufReport open onClose={onClose} />}
    >
      <EngineComparisonStrip
        subject={engineSubject}
        physics={physicsReading}
        nowcast={nowcastReading}
        observed={observedReading}
        classify={classify}
        now={now}
      />
      <HamClockTabs
        label="MUF report detail"
        tabs={[
          { id: "path", label: "PATH", content: pathTab },
          { id: "hops", label: "HOPS", content: hopsTab },
        ]}
      />
    </WallReport>
  );
}
