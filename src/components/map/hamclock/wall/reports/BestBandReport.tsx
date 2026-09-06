import { useMemo } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useBandActivity } from "@/hooks/useBandActivity";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useKIndex } from "@/hooks/useSolarData";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useBandVerdicts, type BandLadderEntry } from "@/hooks/useBandVerdicts";
import { useNowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import { getMUFAtLocation } from "@/lib/api/muf";
import { BAND_RANGES } from "@/lib/data/bandRanges";
import { getBandColor } from "@/lib/utils/spotColors";
import { latLonToGrid } from "@/lib/utils/grid";
import { LADDER_RANK } from "@/lib/verdict/ladder";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { SolarMiniChart } from "@/components/solar/SolarMiniChart";
import type { EngineReading } from "@/lib/hamclock/engineComparison";
import {
  ladderStepVerdict,
  probabilityStepClassifier,
} from "@/lib/hamclock/engineComparison";
import { LADDER_WALL_CLASS, LADDER_WALL_LABEL, reportFooter } from "../tokens";
import { EngineComparisonStrip } from "./EngineComparisonStrip";
import { WallReport, type WallReportFact } from "./WallReport";
import { useHamClockSessionTrend } from "./sessionTrend";

export interface BestBandReportProps {
  open: boolean;
  onClose: () => void;
}

/** Ties broken the same way `selectBestBand` breaks them: ladder rank, then
 * 20-min observations, then reporters — so the rank order here can never
 * disagree with which band the tile calls "best". */
function rankBands(entries: BandLadderEntry[]): BandLadderEntry[] {
  return [...entries].sort((a, b) => {
    const rankDelta = LADDER_RANK[b.stable] - LADDER_RANK[a.stable];
    if (rankDelta !== 0) return rankDelta;
    const obsDelta = b.result.inputs.obs20m - a.result.inputs.obs20m;
    if (obsDelta !== 0) return obsDelta;
    return b.result.inputs.reporters20m - a.result.inputs.reporters20m;
  });
}

function predictedLabel(physicsOpen: boolean, physicsScore: number): string {
  if (physicsOpen) return physicsScore >= 0.7 ? "OPEN" : "MARGINAL";
  return "CLOSED";
}

function predictedTone(physicsOpen: boolean, physicsScore: number): string {
  if (!physicsOpen) return "hc-dim-text";
  return physicsScore >= 0.7 ? "hc-good" : "hc-warn";
}

/** Signed distance from the band's top edge to the current MUF: positive
 * means the whole band sits below the MUF (fully open by frequency). */
function deltaMufMHz(band: string, mufMHz: number | null): number | null {
  if (mufMHz === null) return null;
  const range = BAND_RANGES[band];
  if (!range) return null;
  return mufMHz - range.endKHz / 1000;
}

function BandSparkline({
  band,
  score,
  stamp,
}: {
  band: string;
  score: number;
  stamp: number | undefined;
}) {
  const trend = useHamClockSessionTrend(
    `best-band-score-${band}`,
    score,
    stamp,
  );
  return (
    <div className="hcr-bandtable-spark">
      <SolarMiniChart
        label={`${band} score trend`}
        points={trend}
        unit="score"
        min={0}
        max={100}
        maxGapMs={10 * 60 * 1000}
      />
    </div>
  );
}

/** One clickable ranked row; a plain accessible `<button>` so the row itself
 * carries the ≥44px hit target and sets band focus on the map. */
function BandRow({
  entry,
  rank,
  leader,
  mufMHz,
  activityFetchedAt,
  onFocus,
}: {
  entry: BandLadderEntry;
  rank: number;
  leader: boolean;
  mufMHz: number | null;
  activityFetchedAt: number | null;
  onFocus: (band: string) => void;
}) {
  const { band, stable, result } = entry;
  const delta = deltaMufMHz(band, mufMHz);
  const dxCount = result.counts?.sourceCounts60m.dxcluster ?? 0;
  const rbnCount = result.counts?.sourceCounts60m.rbn ?? 0;
  const scoreValue = Math.round(entry.result.inputs.physicsScore * 100);

  return (
    <button type="button" className="hcr-bandrow" onClick={() => onFocus(band)}>
      <span>{rank}</span>
      <span className="hcr-bandrow-band" style={{ color: getBandColor(band) }}>
        {band.toUpperCase()}
      </span>
      <span>{leader ? `LEADING · ${result.inputs.obs20m}/20 MIN` : "—"}</span>
      <span
        className={predictedTone(
          result.evaluation.physicsOpen,
          result.inputs.physicsScore,
        )}
      >
        {predictedLabel(
          result.evaluation.physicsOpen,
          result.inputs.physicsScore,
        )}
      </span>
      <span>
        {dxCount}·{rbnCount}
      </span>
      <span
        className={
          delta === null ? "hc-dim-text" : delta >= 0 ? "hc-good" : "hc-warn"
        }
      >
        {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
      </span>
      <span className={`hcr-bandrow-score ${LADDER_WALL_CLASS[stable]}`}>
        {scoreValue}
      </span>
      <BandSparkline
        band={band}
        score={scoreValue}
        stamp={activityFetchedAt ?? undefined}
      />
    </button>
  );
}

/**
 * The ranked drill-down behind the Best Band tile: every band the ladder is
 * scoring, not just the winner, plus the surprise-activity set — bands with
 * real observed activity while the physics model predicted closed. Rows are
 * the shared band-focus control, so clicking a row filters the map to that
 * band exactly the way the spots sidebar's band toggle does.
 */
export function BestBandReport({ open, onClose }: BestBandReportProps) {
  const { bands, ready, scope, activityScope } = useBandVerdicts();
  const { data: activitySnapshot } = useBandActivity(activityScope);
  const location = useActiveLocation();
  const sfi = useCurrentSFI();
  const now = useUTCClock(60_000);
  const setBandFocus = useHamClockStore((s) => s.setBandFocus);
  const spotFilters = useMapStore((s) => s.spotFilters);
  const setSpotFilters = useMapStore((s) => s.setSpotFilters);
  const target = useMapStore((s) => s.target);
  const reliability = useHamClockStore((s) => s.reliability);
  const kIndexQuery = useKIndex();
  const currentKp =
    kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index ?? null;
  const stationCast = useStationCastContext();

  const muf = useMemo(() => {
    if (!location || sfi == null) return null;
    return getMUFAtLocation(location.lat, location.lon, sfi, now);
  }, [location, sfi, now]);

  const isDaylight = location
    ? SunCalc.getPosition(now, location.lat, location.lon).altitude > 0
    : null;

  const ranked = useMemo(() => rankBands(bands), [bands]);
  const surprises = useMemo(
    () => ranked.filter((entry) => entry.result.evaluation.surprise),
    [ranked],
  );
  const leader = ranked[0] ?? null;
  const activityFetchedAt = activitySnapshot?.fetchedAt ?? null;

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

  const physicsReading: EngineReading = useMemo(() => {
    if (!leader)
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    const pct = Math.round(leader.result.inputs.physicsScore * 100);
    return {
      value: `${pct}%`,
      comparable: { kind: "number", value: pct, unit: "pct" },
      detail: predictedLabel(
        leader.result.evaluation.physicsOpen,
        leader.result.inputs.physicsScore,
      ),
      state: "ok",
    };
  }, [leader]);

  const nowcastReading: EngineReading = useMemo(() => {
    if (!leader || !nowCast.available) {
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    }
    const prediction = nowCast.predictions.get(leader.band);
    if (!prediction) {
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    }
    const pct = Math.round(
      (nowCast.personalized
        ? prediction.personalized_probability
        : prediction.core_probability) * 100,
    );
    return {
      value: `${pct}%`,
      comparable: { kind: "number", value: pct, unit: "pct" },
      detail: `${leader.band.toUpperCase()} PATH TO TARGET`,
      confidence: prediction.confidence * 100,
      state: nowCast.pending ? "stale" : "ok",
    };
  }, [leader, nowCast]);

  const observedReading: EngineReading = useMemo(() => {
    if (!leader)
      return { value: "—", comparable: { kind: "none" }, state: "unavailable" };
    return {
      value: `${leader.result.inputs.obs20m} SPOTS`,
      comparable: {
        kind: "verdict",
        verdict: ladderStepVerdict(leader.stable),
      },
      detail: `${leader.result.counts?.sourceCounts60m.dxcluster ?? 0}·${
        leader.result.counts?.sourceCounts60m.rbn ?? 0
      } DX·RBN`,
      updatedAt: activityFetchedAt ? new Date(activityFetchedAt) : undefined,
      state: "ok",
    };
  }, [leader, activityFetchedAt]);

  const handleFocus = (band: string) => {
    setBandFocus([band]);
    setSpotFilters({ ...spotFilters, bands: [band] });
  };

  const { footer, updated } = reportFooter(
    "BAND HEALTH LADDER · PHYSICS + LIVE ACTIVITY",
    // The ladder's freshness is the activity feed's own fetch time; without
    // one the footer waits rather than claiming "just now".
    activityFetchedAt ?? null,
  );

  const facts: WallReportFact[] = [
    {
      label: "COMPUTED MUF",
      value: muf === null ? "—" : `${muf.toFixed(1)} MHz`,
    },
    {
      label: "SIDE",
      value: isDaylight === null ? "—" : isDaylight ? "DAYSIDE" : "NIGHTSIDE",
    },
    { label: "SCOPE", value: scope.label.toUpperCase() },
    { label: "BANDS RANKED", value: ranked.length },
    { label: "SURPRISE", value: surprises.length },
  ];

  if (!ready || ranked.length === 0) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Best band report · ranked"
        hero="—"
        verdict="NO DATA"
        facts={facts}
        footer={footer}
        updated={updated}
      >
        <p className="hcr-note">Waiting for live evidence in this scope…</p>
      </WallReport>
    );
  }

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Best band now · computed MUF ${muf === null ? "—" : `${muf.toFixed(1)} MHz`}${
        isDaylight === null
          ? ""
          : ` · ${isDaylight ? "dayside" : "nightside"} at QTH`
      }`}
      tone={leader ? "good" : "info"}
      hero={leader ? leader.band.toUpperCase() : "—"}
      verdict={leader ? LADDER_WALL_LABEL[leader.stable] : "NO DATA"}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="best-band"
      pinElement={<BestBandReport open onClose={onClose} />}
    >
      {leader && (
        <EngineComparisonStrip
          subject={leader.band.toUpperCase()}
          physics={physicsReading}
          nowcast={nowcastReading}
          observed={observedReading}
          classify={probabilityStepClassifier()}
          now={now}
        />
      )}
      <div className="hcr-box">
        <p className="hcr-bandtable-caption">Ranked bands · {scope.label}</p>
        <div className="hcr-bandtable-head" aria-hidden="true">
          <span>#</span>
          <span>Band</span>
          <span>Status</span>
          <span>Predicted</span>
          <span>DX·RBN</span>
          <span>ΔMUF</span>
          <span>Score</span>
          <span>2H scope</span>
        </div>
        <div className="hcr-bandtable">
          {ranked.map((entry, index) => (
            <BandRow
              key={entry.band}
              entry={entry}
              rank={index + 1}
              leader={index === 0}
              mufMHz={muf}
              activityFetchedAt={activityFetchedAt}
              onFocus={handleFocus}
            />
          ))}
        </div>
        {/* The grid above is decorative (`aria-hidden` header); this table is
            what assistive tech reads, per the style guide's sr-only twin rule. */}
        <table className="sr-only">
          <caption>Ranked bands, {scope.label}</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Band</th>
              <th scope="col">Status</th>
              <th scope="col">Predicted</th>
              <th scope="col">DX spots</th>
              <th scope="col">RBN spots</th>
              <th scope="col">Delta MUF</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, index) => (
              <tr key={entry.band}>
                <td>{index + 1}</td>
                <td>{entry.band}</td>
                <td>
                  {index === 0
                    ? `Leading, ${entry.result.inputs.obs20m} observations in 20 minutes`
                    : "—"}
                </td>
                <td>
                  {predictedLabel(
                    entry.result.evaluation.physicsOpen,
                    entry.result.inputs.physicsScore,
                  )}
                </td>
                <td>{entry.result.counts?.sourceCounts60m.dxcluster ?? 0}</td>
                <td>{entry.result.counts?.sourceCounts60m.rbn ?? 0}</td>
                <td>
                  {(() => {
                    const delta = deltaMufMHz(entry.band, muf);
                    return delta === null ? "—" : `${delta.toFixed(1)} MHz`;
                  })()}
                </td>
                <td>{Math.round(entry.result.inputs.physicsScore * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {surprises.length > 0 && (
        <div className="hcr-box">
          <p className="hcr-bandtable-caption">
            Surprise activity — predicted closed
          </p>
          <div className="hcr-bandtable">
            {surprises.map((entry) => (
              <BandRow
                key={entry.band}
                entry={entry}
                rank={ranked.indexOf(entry) + 1}
                leader={false}
                mufMHz={muf}
                activityFetchedAt={activityFetchedAt}
                onFocus={handleFocus}
              />
            ))}
          </div>
        </div>
      )}
    </WallReport>
  );
}
