import { useMemo, useState } from "react";
import { useSolarResource } from "@/hooks/useSolarResource";
import { useFluxOutlook } from "@/hooks/useSolarData";
import type {
  KpPoint,
  SolarFluxPoint,
  SunspotPoint,
} from "@/lib/solar/dataTypes";
import {
  currentKp,
  fluxTrendWithForecastTail,
  latestByTime,
} from "@/lib/solar/selectors";
import {
  SOLAR_CYCLE_DATA,
  getSolarCyclePosition,
  getSolarCycleTrend,
} from "@/lib/data/historicalPropagation";
import { WallSeriesChart } from "./WallSeriesChart";
import { HamClockTabs } from "../controls";
import { reportFooter } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

/** Cycle 25's only durable "peak" number: the largest curated monthly SSN. */
function cycle25PeakSsn(): number | null {
  const cycle25 = SOLAR_CYCLE_DATA.filter((point) => point.cycle === 25);
  if (cycle25.length === 0) return null;
  return Math.max(...cycle25.map((point) => point.ssn));
}

const CYCLE_PHASE_LABEL: Record<
  ReturnType<typeof getSolarCyclePosition>["phase"],
  string
> = {
  rising: "RISING",
  peak: "PEAK",
  declining: "DECLINING",
};

export interface SolarReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The flux-and-cycle drill-down behind the space-weather tile. X-ray and
 * solar-wind readings moved to their own dedicated reports (HW-B19); this
 * report is left with the two numbers that share a timescale — the 10.7 cm
 * flux trend and where Cycle 25 sits — split across a NOW tab (flux plus its
 * own 27-day outlook tail) and a CYCLE tab (the curated Cycle 25 reference).
 */
export function SolarReport({ open, onClose }: SolarReportProps) {
  const [tab, setTab] = useState<"now" | "cycle">("now");

  const fluxQuery = useSolarResource<SolarFluxPoint[]>("noaa-solar-flux");
  const outlookQuery = useFluxOutlook();
  const sunspotQuery = useSolarResource<SunspotPoint[]>("noaa-sunspots");
  const kpQuery = useSolarResource<KpPoint[]>("noaa-k-index");

  const flux = latestByTime(
    fluxQuery.data?.envelope.data,
    (point) => point.time_tag,
  );
  const sunspots = sunspotQuery.data?.envelope.data ?? [];
  const ssn = sunspots.at(-1)?.ssn ?? null;
  const kpPoint = currentKp(kpQuery.data?.envelope.data);
  const aIndex = kpPoint?.a_running ?? null;
  const outlookTail = outlookQuery.data?.outlook.at(-1)?.predicted_flux ?? null;

  const cyclePosition = useMemo(() => getSolarCyclePosition(), []);
  const cycle25Latest = useMemo(
    () => SOLAR_CYCLE_DATA.filter((point) => point.cycle === 25).at(-1) ?? null,
    [],
  );
  const cyclePeakSsn = useMemo(() => cycle25PeakSsn(), []);
  const fluxTrend = useMemo(() => {
    const recent = (fluxQuery.data?.envelope.data ?? [])
      .slice(-10)
      .map((point) => point.flux);
    return getSolarCycleTrend(recent);
  }, [fluxQuery.data]);

  const facts: WallReportFact[] = [
    { label: "SFI", value: flux ? Math.round(flux.flux) : "—" },
    {
      label: "27D FCST",
      value: outlookTail === null ? "—" : Math.round(outlookTail),
    },
    { label: "SSN", value: ssn === null ? "—" : Math.round(ssn) },
    { label: "A-INDEX", value: aIndex === null ? "—" : Math.round(aIndex) },
    { label: "PHASE", value: CYCLE_PHASE_LABEL[cyclePosition.phase] },
    {
      label: "CYCLE SSN",
      value: cycle25Latest ? Math.round(cycle25Latest.ssn) : "—",
    },
    { label: "PEAK SSN", value: cyclePeakSsn === null ? "—" : cyclePeakSsn },
    { label: "SFI TREND", value: fluxTrend.toUpperCase() },
  ];

  const observedAt =
    tab === "cycle"
      ? sunspotQuery.data?.envelope.observedAt
      : fluxQuery.data?.envelope.observedAt;
  const { footer, updated } = reportFooter(
    tab === "cycle"
      ? "NOAA SWPC / SIDC · CURATED CYCLE 25 REFERENCE"
      : "NOAA SWPC",
    observedAt ? Date.parse(observedAt) : null,
  );

  const nowChartPoints = fluxTrendWithForecastTail(
    fluxQuery.data?.envelope.data,
    outlookQuery.data?.outlook,
  ).map((point) => ({
    timestamp: point.time_tag,
    value: point.flux,
    kind: point.kind,
  }));

  // `SolarSeriesChart` only draws a clean connected line within a kind for
  // points that are chronologically contiguous with the same-kind points
  // around them (the pattern that works for an observed-then-future
  // forecast tail); two full-range series covering the *same* months would
  // interleave and fragment both lines. `SOLAR_CYCLE_DATA` has no
  // predicted/high/low fields of its own — it is a curated *historical*
  // reference (through early 2026), not a live forward forecast — so rather
  // than mislabel it "predicted" (the chart's built-in legend text for that
  // kind reads "Official NOAA prediction"), it is charted as "estimated"
  // and restricted to months strictly before the earliest live NOAA
  // sunspot row. That keeps the two series non-overlapping (clean lines on
  // both) and honestly extends the visible curve back to Cycle 25's start
  // (Dec 2019) well beyond the live feed's ~3-year retention window.
  const earliestLiveMonth = sunspots[0]?.time_tag ?? null;
  const cycle25Reference = SOLAR_CYCLE_DATA.filter(
    (point) => point.cycle === 25,
  )
    .map((point) => ({
      timestamp: `${point.year}-${String(point.month).padStart(2, "0")}-01T00:00:00Z`,
      value: point.ssn,
      monthKey: `${point.year}-${String(point.month).padStart(2, "0")}`,
    }))
    .filter(
      (point) => !earliestLiveMonth || point.monthKey < earliestLiveMonth,
    )
    .map(({ timestamp, value }) => ({
      timestamp,
      value,
      kind: "estimated" as const,
    }));
  const cycleChartPoints = [
    ...cycle25Reference,
    ...sunspots.map((point) => ({
      timestamp: `${point.time_tag}-01T00:00:00Z`,
      value: point.ssn,
      kind: "observed" as const,
    })),
  ];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Solar report · flux & cycle"
      tone="info"
      hero={
        flux ? (
          <>
            {Math.round(flux.flux)}
            <span className="hcr-unit">SFU</span>
          </>
        ) : (
          "—"
        )
      }
      verdict={CYCLE_PHASE_LABEL[cyclePosition.phase]}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="solar-now"
      pinElement={<SolarReport open onClose={onClose} />}
    >
      <HamClockTabs
        label="Solar report tabs"
        active={tab}
        onChange={(id) => setTab(id as "now" | "cycle")}
        tabs={[
          {
            id: "now",
            label: "NOW",
            content: (
              <div className="hcr-chart">
                <p className="hcr-chart-title">SFI — 30 D · NOAA SWPC</p>
                <WallSeriesChart
                  label="SFI — 30 D · NOAA SWPC"
                  points={nowChartPoints}
                  unit="sfu"
                  maxGapMs={36 * 3_600_000}
                />
              </div>
            ),
          },
          {
            id: "cycle",
            label: "CYCLE",
            content: (
              <div className="hcr-chart">
                <p className="hcr-chart-title">SSN — CYCLE 25 · SIDC / NOAA</p>
                <WallSeriesChart
                  label="SSN — CYCLE 25 · SIDC / NOAA"
                  points={cycleChartPoints}
                  unit="SSN"
                  maxGapMs={95 * 86_400_000}
                />
                <p className="hcr-note">
                  Curated Cycle 25 reference (dashed) extends the curve back
                  to Dec 2019 — mean SSN only, no forecast high/low envelope
                  is published. Live NOAA monthly counts (solid) continue it.
                  Currently {CYCLE_PHASE_LABEL[cyclePosition.phase]}
                  {cyclePeakSsn !== null
                    ? `, provisional peak SSN ${cyclePeakSsn}`
                    : ""}
                  .
                </p>
              </div>
            ),
          },
        ]}
      />
    </WallReport>
  );
}
