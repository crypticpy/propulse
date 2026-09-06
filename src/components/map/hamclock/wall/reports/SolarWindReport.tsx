import { useRef, useState } from "react";
import { useSolarResource } from "@/hooks/useSolarResource";
import { useMagnetometer24h } from "@/hooks/useSolarData";
import {
  useDstIndex,
  useCMEAnalysis,
  useProtonFlux,
} from "@/hooks/useSolarExpanded";
import type {
  KpPoint,
  NoaaScalesProduct,
  SolarWindPlasmaPoint,
} from "@/lib/solar/dataTypes";
import { currentKp, latestByTime, protonScale } from "@/lib/solar/selectors";
import { useMapStore } from "@/stores/mapStore";
import { WallSeriesChart } from "./WallSeriesChart";
import { HamClockButton, HamClockSegmented, HamClockTabs } from "../controls";
import { useVisibleRows } from "../useVisibleRows";
import {
  bzTone,
  kpDescriptor,
  kpTone,
  reportFooter,
  reportTone,
  windSpeedTone,
} from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

/** ±20 nT covers everything short of an extreme storm — same span the tile gauge uses. */
const BZ_LIMIT = 20;

type WindSeries = "bz" | "speed" | "density";

/** One full-height WIND chart at a time, chosen by big buttons (guide §9). */
const WIND_OPTIONS: readonly { value: WindSeries; label: string }[] = [
  { value: "bz", label: "BZ" },
  { value: "speed", label: "SPEED" },
  { value: "density", label: "DENSITY" },
];

/** Severity rank so the worse of two tones can be picked deterministically. */
const TONE_RANK: Record<string, number> = {
  "hc-good": 0,
  "hc-warn": 1,
  "hc-bad": 2,
};

/**
 * The worse of two tone classes. Bz and wind speed are independent readings
 * of the same wind hero, so whichever is angrier should win — a northward Bz
 * reads good even at a 700 km/s stream, which would otherwise hide the
 * high-speed tone the tile shows.
 */
function worseTone(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return TONE_RANK[a] >= TONE_RANK[b] ? a : b;
}

export interface SolarWindReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The L1/geomagnetic drill-down behind the solar-wind tile: WIND (Bz, speed,
 * density), GEOMAGNETIC (Kp, Dst, G-scale) and EVENTS (CMEs, proton flux) each
 * get their own tab so the 24h Bz trend, the 3-day Kp trend and the event
 * list never have to share one crowded panel.
 */
export function SolarWindReport({ open, onClose }: SolarWindReportProps) {
  const plasmaQuery = useSolarResource<SolarWindPlasmaPoint[]>(
    "swpc-solar-wind-plasma",
  );
  const magQuery = useMagnetometer24h();
  const kpQuery = useSolarResource<KpPoint[]>("noaa-k-index");
  const dstQuery = useDstIndex();
  const scalesQuery = useSolarResource<NoaaScalesProduct>("swpc-scales");
  const cmeQuery = useCMEAnalysis();
  const protonQuery = useProtonFlux();
  const layers = useMapStore((state) => state.layers);
  const toggleLayer = useMapStore((state) => state.toggleLayer);
  const [windSeries, setWindSeries] = useState<WindSeries>("bz");
  const eventsRef = useRef<HTMLDivElement>(null);

  const plasma = latestByTime(
    plasmaQuery.data?.envelope.data,
    (point) => point.time_tag,
    (point) => point.speed !== null,
  );
  const mag = latestByTime(
    magQuery.data,
    (point) => point.time_tag,
    (point) => point.bz_gsm !== null,
  );
  const speed = plasma?.speed ?? null;
  const bz = mag?.bz_gsm ?? null;
  const kp = currentKp(kpQuery.data?.envelope.data)?.kp ?? null;
  const dst = dstQuery.data?.at(-1)?.dst ?? null;
  const scales = scalesQuery.data?.envelope.data;
  const proton = protonQuery.data?.at(-1)?.flux ?? null;

  // Both L1 feeds can go down together (a single upstream outage) while the
  // planetary Kp index — derived from ground magnetometers, not L1 — keeps
  // reporting. Falling all the way to "NO DATA" would hide a live storm
  // signal the report already has in hand, so Kp stands in for the hero and
  // verdict in that case, and a note names the actual gap.
  const l1Down = bz === null && speed === null;
  const heroTone = l1Down
    ? kp !== null
      ? kpTone(kp).tone
      : "hc-dim-text"
    : (worseTone(
        bz !== null ? bzTone(bz) : null,
        speed !== null ? windSpeedTone(speed) : null,
      ) ?? "hc-dim-text");

  const hero = l1Down ? (
    kp === null ? (
      "—"
    ) : (
      <>
        {kp.toFixed(1)}
        <span className="hcr-unit">Kp</span>
      </>
    )
  ) : speed === null ? (
    "—"
  ) : (
    <>
      {Math.round(speed)}
      <span className="hcr-unit">KM/S</span>
    </>
  );

  const verdict = l1Down
    ? kp !== null
      ? kpDescriptor(kp)
      : "NO DATA"
    : bz !== null && bz <= -10
      ? "Bz STORM"
      : bz !== null && bz < 0
        ? "Bz SOUTH"
        : speed !== null && speed >= 600
          ? "HIGH SPEED"
          : "QUIET STREAM";

  const facts: WallReportFact[] = [
    {
      label: "Bz",
      value: l1Down
        ? "L1 DOWN"
        : bz === null
          ? "—"
          : `${bz >= 0 ? "+" : ""}${bz.toFixed(1)} nT`,
    },
    {
      label: "SPEED",
      value: l1Down
        ? "L1 DOWN"
        : speed === null
          ? "—"
          : `${Math.round(speed)} km/s`,
    },
    {
      label: "DENSITY",
      value: l1Down
        ? "L1 DOWN"
        : plasma?.density == null
          ? "—"
          : `${plasma.density.toFixed(1)} p/cm³`,
    },
    { label: "Kp", value: kp === null ? "—" : kp.toFixed(1) },
    { label: "DST", value: dst === null ? "—" : `${dst} nT` },
    {
      label: "G-SCALE",
      value: scales ? `G${scales.geomagnetic_storm.scale ?? 0}` : "—",
    },
  ];

  const { footer, updated } = reportFooter(
    "NOAA SWPC · ACE/DSCOVR AT L1",
    magQuery.dataUpdatedAt > 0 ? magQuery.dataUpdatedAt : null,
  );

  const cmeEvents = cmeQuery.data ?? [];
  // Proton row + CMEs, newest first; only whole rows that fit the slot
  // render (the report never scrolls).
  const eventRows = 1 + cmeEvents.length;
  const visibleEvents = useVisibleRows(eventsRef, eventRows);
  const visibleCmes = Math.max(0, visibleEvents - 1);

  const magPoints = (magQuery.data ?? [])
    .filter((point) => point.bz_gsm !== null)
    .map((point) => ({
      timestamp: point.time_tag,
      value: point.bz_gsm as number,
    }));
  const plasmaPoints = (key: "speed" | "density") =>
    (plasmaQuery.data?.envelope.data ?? [])
      .filter((point) => point[key] !== null)
      .map((point) => ({
        timestamp: point.time_tag,
        value: point[key] as number,
      }));
  const windChart =
    windSeries === "bz"
      ? {
          title: "Bz — 24 H · ACE/DSCOVR AT L1",
          points: magPoints,
          unit: "nT",
          min: -BZ_LIMIT,
          max: BZ_LIMIT,
        }
      : windSeries === "speed"
        ? {
            title: "Speed — 24 H · ACE/DSCOVR AT L1",
            points: plasmaPoints("speed"),
            unit: "km/s",
          }
        : {
            title: "Density — 24 H · ACE/DSCOVR AT L1",
            points: plasmaPoints("density"),
            unit: "p/cm³",
          };

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Solar wind report · L1 & geomagnetic"
      tone={reportTone(heroTone)}
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="solar-wind"
      pinElement={<SolarWindReport open onClose={onClose} />}
    >
      {l1Down && (
        <p className="hcr-note">
          L1 WIND FEED DOWN — hero and verdict fall back to the planetary Kp
          reading.
        </p>
      )}
      <HamClockTabs
        label="Solar wind report tabs"
        tabs={[
          {
            id: "wind",
            label: "WIND",
            content: (
              <>
                <HamClockSegmented
                  label="Wind series"
                  hideLabel
                  options={WIND_OPTIONS}
                  value={windSeries}
                  onChange={setWindSeries}
                />
                <div className="hcr-chart">
                  <p className="hcr-chart-title">{windChart.title}</p>
                  <WallSeriesChart
                    label={windChart.title}
                    points={windChart.points}
                    unit={windChart.unit}
                    min={windChart.min}
                    max={windChart.max}
                    maxGapMs={300_000}
                  />
                </div>
              </>
            ),
          },
          {
            id: "geomagnetic",
            label: "GEOMAGNETIC",
            content: (
              <>
                <div className="hcr-chart">
                  <p className="hcr-chart-title">Kp — 3 D · NOAA</p>
                  <WallSeriesChart
                    label="Kp — 3 D · NOAA"
                    points={(kpQuery.data?.envelope.data ?? [])
                      .filter((point) => point.kind !== "predicted")
                      .slice(-24)
                      .map((point) => ({
                        timestamp: point.time_tag,
                        value: point.kp,
                        kind: point.kind,
                      }))}
                    unit="Kp"
                    min={0}
                    max={9}
                    intervalMs={10_800_000}
                    maxGapMs={10_800_000}
                  />
                </div>
                <div className="hcr-cols">
                  <p className="hcr-note">
                    Aurora imagery only — NOAA does not publish a numeric
                    oval-reach latitude to fact here.
                  </p>
                  <HamClockButton
                    variant="quiet"
                    onClick={() => toggleLayer("aurora")}
                    aria-pressed={layers.aurora}
                  >
                    {layers.aurora
                      ? "HIDE AURORA ON MAP"
                      : "SHOW AURORA ON MAP"}
                  </HamClockButton>
                </div>
              </>
            ),
          },
          {
            id: "events",
            label: "EVENTS",
            content: (
              <div className="hcr-box hcr-box--fill">
                <h4>
                  CME analysis · proton flux
                  {visibleCmes < cmeEvents.length
                    ? ` · latest ${visibleCmes} of ${cmeEvents.length}`
                    : ""}
                </h4>
                <div className="hcr-list" ref={eventsRef}>
                  <div className="hcr-item hc-info-text">
                    <b>{proton === null ? "—" : protonScale(proton)}</b>
                    <span>
                      GOES ≥10 MeV proton flux
                      {proton === null ? "" : ` · ${proton.toFixed(1)} pfu`}
                    </span>
                  </div>
                  {cmeEvents.length > 0 ? (
                    cmeEvents.slice(0, visibleCmes).map((cme, index) => (
                      <div
                        key={`${cme.time21_5}-${index}`}
                        className="hcr-item hc-accent-text"
                      >
                        <b>{Math.round(cme.speed)} km/s</b>
                        <span>
                          {cme.time21_5.slice(0, 16).replace("T", " ")}Z ·
                          half-angle {Math.round(cme.halfAngle)}° ·{" "}
                          {cme.note || cme.type}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="hcr-empty">NONE ANALYSED IN 7 DAYS</p>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </WallReport>
  );
}
