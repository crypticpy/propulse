import { useMemo } from "react";
import { useSolarResource } from "@/hooks/useSolarResource";
import { useXray24h, useProbabilities } from "@/hooks/useSolarData";
import { useDRAPData } from "@/hooks/useSolarExpanded";
import type { LatestXrayFlare, NoaaScalesProduct } from "@/lib/solar/dataTypes";
import { latestByTime, xrayClass } from "@/lib/solar/selectors";
import { useMapStore } from "@/stores/mapStore";
import { SolarSeriesChart } from "@/components/solar/SolarSeriesChart";
import { HamClockButton, HamClockTabs } from "../controls";
import { reportFooter, reportTone, xrayTone } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

const XRAY_THRESHOLDS = [
  { value: 1e-7, label: "B" },
  { value: 1e-6, label: "C" },
  { value: 1e-5, label: "M" },
  { value: 1e-4, label: "X" },
];

interface ProbabilityRow {
  key: string;
  label: string;
  percent: number;
}

/** Highest frequency the current D-RAP grid says HF is absorbed at. */
function maxDrapFrequency(
  grid: { frequencies: number[][] } | undefined,
): number | null {
  if (!grid) return null;
  let maximum = -Infinity;
  for (const row of grid.frequencies)
    for (const value of row) maximum = Math.max(maximum, value);
  return Number.isFinite(maximum) ? maximum : null;
}

/**
 * The X-ray drill-down behind the X-ray tile: current class and 24h peak up
 * top, then FLUX / ABSORPTION / PROBABILITIES tabs so the log-scale chart, the
 * D-RAP snapshot and the flare-probability grid each get their own space
 * instead of competing for one crowded panel.
 */
export function XrayReport({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const xrayQuery = useXray24h();
  const latestFlareQuery =
    useSolarResource<LatestXrayFlare>("swpc-xray-latest");
  const scalesQuery = useSolarResource<NoaaScalesProduct>("swpc-scales");
  const drapQuery = useDRAPData();
  const probabilitiesQuery = useProbabilities();
  const layers = useMapStore((state) => state.layers);
  const toggleLayer = useMapStore((state) => state.toggleLayer);

  const points = xrayQuery.data;
  const current = latestByTime(points, (point) => point.time_tag);
  const peak = useMemo(() => {
    if (!points || points.length === 0) return null;
    return points.reduce((best, point) =>
      point.flux > best.flux ? point : best,
    );
  }, [points]);
  const flare = latestFlareQuery.data?.envelope.data;
  const scales = scalesQuery.data?.envelope.data;

  const currentLabel = current ? (xrayClass(current.flux) ?? "—") : "—";
  const peakLabel = peak ? (xrayClass(peak.flux) ?? "—") : "—";
  const heroTone = current
    ? xrayTone(currentLabel.charAt(0)).tone
    : "hc-dim-text";

  const verdict = !current
    ? "NO DATA"
    : currentLabel.charAt(0) === "X"
      ? "MAJOR FLARE"
      : currentLabel.charAt(0) === "M"
        ? "FLARE"
        : currentLabel.charAt(0) === "C"
          ? "ACTIVE SUN"
          : "QUIET SUN";

  const noFlaresAboveB =
    !peak || peakLabel.charAt(0) === "A" || peakLabel.charAt(0) === "B";

  const facts: WallReportFact[] = [
    { label: "CURRENT", value: currentLabel },
    { label: "24H PEAK", value: peakLabel },
    {
      label: "LATEST FLARE",
      value: flare
        ? `${flare.max_class} @ ${flare.max_time.slice(11, 16)}Z`
        : "—",
    },
    {
      label: "R-SCALE",
      value: scales ? `R${scales.radio_blackout.scale ?? 0}` : "—",
    },
  ];

  const { footer, updated } = reportFooter(
    "NOAA SWPC · GOES",
    xrayQuery.dataUpdatedAt > 0 ? xrayQuery.dataUpdatedAt : null,
  );

  const drapFrequency = maxDrapFrequency(drapQuery.data);
  const probabilities = probabilitiesQuery.data;
  const probabilityRows: ProbabilityRow[] = probabilities
    ? [
        { key: "c", label: "C CLASS", percent: probabilities.c_prob },
        { key: "m", label: "M CLASS", percent: probabilities.m_prob },
        { key: "x", label: "X CLASS", percent: probabilities.x_prob },
        {
          key: "proton",
          label: "PROTON EVENT",
          percent: probabilities.proton_prob,
        },
      ]
    : [];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="X-ray report · GOES flux"
      tone={reportTone(heroTone)}
      hero={currentLabel}
      verdict={verdict}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="xray"
      pinElement={<XrayReport open onClose={onClose} />}
    >
      <HamClockTabs
        label="X-ray report tabs"
        tabs={[
          {
            id: "flux",
            label: "FLUX",
            content: (
              <div className="hcr-chart">
                <SolarSeriesChart
                  label="X-RAY FLUX — 24 H · GOES · LOG SCALE"
                  points={(points ?? []).map((point) => ({
                    timestamp: point.time_tag,
                    value: point.flux,
                  }))}
                  unit="W/m²"
                  scale="log"
                  min={1e-8}
                  max={1e-3}
                  maxGapMs={300_000}
                  thresholds={XRAY_THRESHOLDS}
                  markers={
                    flare
                      ? [{ timestamp: flare.max_time, label: flare.max_class }]
                      : []
                  }
                />
                {noFlaresAboveB && (
                  <p className="hcr-note">NO FLARES ABOVE B IN 24H</p>
                )}
              </div>
            ),
          },
          {
            id: "absorption",
            label: "ABSORPTION",
            content: (
              <div className="hcr-box">
                <h4>D-RAP HF absorption</h4>
                {drapFrequency !== null && drapQuery.data ? (
                  <>
                    <dl className="hcr-kv">
                      <dt>MAX ABSORBED FREQ</dt>
                      <dd>{drapFrequency.toFixed(1)} MHz</dd>
                      <dt>VALID AT</dt>
                      <dd>{drapQuery.data.observation_time.slice(11, 16)}Z</dd>
                    </dl>
                    <p className="hcr-note">
                      D-RAP is a single global snapshot, not a retained trend —
                      the map shows where the model places sunlit-side
                      absorption right now.
                    </p>
                  </>
                ) : (
                  <p className="hcr-empty">NONE MAPPED</p>
                )}
                <HamClockButton
                  variant="quiet"
                  onClick={() => toggleLayer("drap")}
                  aria-pressed={layers.drap}
                >
                  {layers.drap ? "HIDE D-RAP ON MAP" : "SHOW D-RAP ON MAP"}
                </HamClockButton>
              </div>
            ),
          },
          {
            id: "probabilities",
            label: "PROBABILITIES",
            content: (
              <div className="hcr-box">
                <h4>NOAA 1-day flare probability</h4>
                {probabilityRows.length > 0 ? (
                  <>
                    <div className="hcr-list" aria-hidden="true">
                      {probabilityRows.map((row) => (
                        <div key={row.key} className="hcr-item hc-info-text">
                          <b>{Math.round(row.percent)}%</b>
                          <span>{row.label}</span>
                        </div>
                      ))}
                    </div>
                    <table className="sr-only">
                      <caption>
                        NOAA 1-day flare and proton-event probability
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Category</th>
                          <th scope="col">Probability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {probabilityRows.map((row) => (
                          <tr key={row.key}>
                            <th scope="row">{row.label}</th>
                            <td>{Math.round(row.percent)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="hcr-empty">NO FORECAST ISSUED</p>
                )}
              </div>
            ),
          },
        ]}
      />
    </WallReport>
  );
}
