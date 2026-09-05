import { useMemo } from "react";
import { useSolarResource } from "@/hooks/useSolarResource";
import { useSunspots } from "@/hooks/useSolarData";
import type {
  KpPoint,
  NoaaScalesProduct,
  SolarFluxPoint,
  SolarWindMagPoint,
  SolarWindPlasmaPoint,
  XrayPoint,
} from "@/lib/solar/dataTypes";
import { currentKp, latestByTime, xrayClass } from "@/lib/solar/selectors";
import {
  bzTone,
  kpDescriptor,
  kpTone,
  reportTone,
  windSpeedTone,
  xrayTone,
} from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

/** Which tile opened the report; it only chooses the hero, not the data. */
export type SolarFocus = "kp" | "xray" | "wind";

const DAY_MS = 24 * 60 * 60 * 1000;

interface StripCell {
  key: string;
  label: string;
  tone: string;
  now: boolean;
}

/**
 * One 24-hour colour strip. Both series the report can draw are irregular —
 * Kp arrives every three hours, X-ray every minute — so each is bucketed into
 * whole UTC hours and the empty hours stay visibly empty rather than being
 * interpolated into a claim the feed did not make.
 */
function HourStrip({ cells, caption }: { cells: StripCell[]; caption: string }) {
  return (
    <div className="hcr-box">
      <h4>{caption}</h4>
      <div className="hcr-strip">
        {cells.map((cell) => (
          <i
            key={cell.key}
            className={`${cell.tone}${cell.tone === "" ? " hcr-strip-off" : ""}${
              cell.now ? " hcr-strip-now" : ""
            }`}
          />
        ))}
      </div>
      <div className="hcr-strip-x" aria-hidden="true">
        {cells.map((cell) => (
          <span key={cell.key}>{cell.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Kp of the three-hour window each of the last 24 hours falls in. */
function kpStrip(points: readonly KpPoint[] | undefined, now: number): StripCell[] {
  const observed = (points ?? []).filter((point) => point.kind !== "predicted");
  const cells: StripCell[] = [];
  for (let back = 23; back >= 0; back--) {
    const at = now - back * 60 * 60 * 1000;
    const hour = new Date(at).getUTCHours();
    let match: KpPoint | null = null;
    for (const point of observed) {
      const stamp = Date.parse(point.time_tag);
      if (!Number.isFinite(stamp) || stamp > at) continue;
      if (at - stamp > 3 * 60 * 60 * 1000) continue;
      if (!match || stamp > Date.parse(match.time_tag)) match = point;
    }
    cells.push({
      key: `kp-${back}`,
      label: hour % 3 === 0 ? String(hour).padStart(2, "0") : "",
      tone: match ? kpTone(match.kp).tone : "",
      now: back === 0,
    });
  }
  return cells;
}

/** Peak X-ray class in each of the last 24 whole UTC hours. */
function xrayStrip(
  points: readonly XrayPoint[] | undefined,
  now: number,
): StripCell[] {
  const peaks = new Map<number, number>();
  for (const point of points ?? []) {
    const stamp = Date.parse(point.time_tag);
    if (!Number.isFinite(stamp) || now - stamp > DAY_MS || stamp > now) continue;
    const bucket = Math.floor(stamp / (60 * 60 * 1000));
    peaks.set(bucket, Math.max(peaks.get(bucket) ?? 0, point.flux));
  }
  const cells: StripCell[] = [];
  for (let back = 23; back >= 0; back--) {
    const at = now - back * 60 * 60 * 1000;
    const flux = peaks.get(Math.floor(at / (60 * 60 * 1000)));
    const hour = new Date(at).getUTCHours();
    cells.push({
      key: `xray-${back}`,
      label: hour % 3 === 0 ? String(hour).padStart(2, "0") : "",
      tone: flux ? xrayTone((xrayClass(flux) ?? "A").charAt(0)).tone : "",
      now: back === 0,
    });
  }
  return cells;
}

/** Severity rank so the worse of two tones can be picked deterministically. */
const TONE_RANK: Record<string, number> = {
  "hc-good": 0,
  "hc-warn": 1,
  "hc-bad": 2,
};

/**
 * The worse of two tone classes. Bz and wind speed are independent readings
 * of the same wind hero, so whichever one is angrier should win rather than
 * always deferring to Bz — a northward Bz reads good even at a 700 km/s
 * stream, which would otherwise hide the high-speed tone the tile shows.
 */
function worseTone(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return TONE_RANK[a] >= TONE_RANK[b] ? a : b;
}

const SCALE_LABEL = {
  G: "GEOMAGNETIC STORM",
  S: "SOLAR RADIATION",
  R: "RADIO BLACKOUT",
} as const;

export interface SolarReportProps {
  open: boolean;
  onClose: () => void;
  focus: SolarFocus;
}

/**
 * The space-weather drill-down behind the X-ray, solar wind and space weather
 * tiles. One report, three entrances: the tile that opened it picks the hero,
 * and every other number is on the facts column regardless, so an operator
 * never has to open a second report to see the whole sky.
 */
export function SolarReport({ open, onClose, focus }: SolarReportProps) {
  const kpQuery = useSolarResource<KpPoint[]>("noaa-k-index");
  const scalesQuery = useSolarResource<NoaaScalesProduct>("swpc-scales");
  const fluxQuery = useSolarResource<SolarFluxPoint[]>("noaa-solar-flux");
  const xrayQuery = useSolarResource<XrayPoint[]>("noaa-xray");
  const plasmaQuery =
    useSolarResource<SolarWindPlasmaPoint[]>("swpc-solar-wind-plasma");
  const magQuery = useSolarResource<SolarWindMagPoint[]>("swpc-solar-wind-mag");
  const sunspotQuery = useSunspots();

  const kpPoint = currentKp(kpQuery.data?.envelope.data);
  const scales = scalesQuery.data?.envelope.data;
  const flux = latestByTime(
    fluxQuery.data?.envelope.data,
    (point) => point.time_tag,
  );
  const xray = latestByTime(
    xrayQuery.data?.envelope.data,
    (point) => point.time_tag,
  );
  const plasma = latestByTime(
    plasmaQuery.data?.envelope.data,
    (point) => point.time_tag,
    (point) => point.speed !== null,
  );
  const mag = latestByTime(
    magQuery.data?.envelope.data,
    (point) => point.time_tag,
    (point) => point.bz_gsm !== null,
  );
  const ssn = sunspotQuery.data?.[sunspotQuery.data.length - 1]?.ssn ?? null;

  const kp = kpPoint?.kp ?? null;
  const speed = plasma?.speed ?? null;
  const bz = mag?.bz_gsm ?? null;
  const xrayLabel = xray ? (xrayClass(xray.flux) ?? "—") : "—";

  // The footer/strip timestamp must describe the feed the focused tile is
  // actually reading, not always the Kp resource — a wind-focused report
  // timed off Kp can read minutes stale against the plasma/mag data it draws.
  const observedAt =
    focus === "xray"
      ? xrayQuery.data?.envelope.observedAt
      : focus === "wind"
        ? (plasmaQuery.data?.envelope.observedAt ??
          magQuery.data?.envelope.observedAt)
        : kpQuery.data?.envelope.observedAt;
  const now = useMemo(() => {
    const stamp = observedAt ? Date.parse(observedAt) : NaN;
    return Number.isFinite(stamp) ? stamp : Date.now();
  }, [observedAt]);

  const strip = useMemo(
    () =>
      focus === "xray"
        ? xrayStrip(xrayQuery.data?.envelope.data, now)
        : kpStrip(kpQuery.data?.envelope.data, now),
    [focus, now, xrayQuery.data, kpQuery.data],
  );

  const heroTone =
    focus === "xray"
      ? xray
        ? xrayTone(xrayLabel.charAt(0)).tone
        : "hc-dim-text"
      : focus === "wind"
        ? (worseTone(
            bz !== null ? bzTone(bz) : null,
            speed !== null ? windSpeedTone(speed) : null,
          ) ?? "hc-dim-text")
        : kp !== null
          ? kpTone(kp).tone
          : "hc-dim-text";

  const hero =
    focus === "xray" ? (
      xrayLabel
    ) : focus === "wind" ? (
      speed === null ? (
        "—"
      ) : (
        <>
          {Math.round(speed)}
          <span className="hcr-unit">KM/S</span>
        </>
      )
    ) : kp === null ? (
      "—"
    ) : (
      <>
        {kp.toFixed(1)}
        <span className="hcr-unit">Kp</span>
      </>
    );

  const verdict =
    focus === "xray"
      ? xray
        ? xrayLabel.charAt(0) === "X"
          ? "MAJOR FLARE"
          : xrayLabel.charAt(0) === "M"
            ? "FLARE"
            : xrayLabel.charAt(0) === "C"
              ? "ACTIVE SUN"
              : "QUIET SUN"
        : "NO DATA"
      : focus === "wind"
        ? bz !== null && bz <= -10
          ? "Bz STORM"
          : bz !== null && bz < 0
            ? "Bz SOUTH"
            : speed !== null && speed >= 600
              ? "HIGH SPEED"
              : speed !== null
                ? "QUIET STREAM"
                : "NO DATA"
        : kp === null
          ? "NO DATA"
          : kpDescriptor(kp);

  const facts: WallReportFact[] = [
    { label: "SFI", value: flux ? Math.round(flux.flux) : "—" },
    { label: "SSN", value: ssn === null ? "—" : Math.round(ssn) },
    { label: "Kp", value: kp === null ? "—" : kp.toFixed(1) },
    {
      label: "Bz",
      value: bz === null ? "—" : `${bz >= 0 ? "+" : ""}${bz.toFixed(1)} nT`,
    },
    {
      label: "WIND",
      value: speed === null ? "—" : `${Math.round(speed)} km/s`,
    },
    { label: "X-RAY", value: xrayLabel },
    {
      label: "NOAA",
      value: scales
        ? `G${scales.geomagnetic_storm.scale ?? 0} S${
            scales.solar_radiation.scale ?? 0
          } R${scales.radio_blackout.scale ?? 0}`
        : "—",
    },
  ];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Solar report · space weather"
      tone={reportTone(heroTone)}
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer="NOAA SWPC · GOES · ACE/DSCOVR AT L1"
      updated={observedAt ? `READ ${observedAt.slice(11, 16)}Z` : "AWAITING FEED"}
    >
      <div className="hcr-cols">
        <HourStrip
          cells={strip}
          caption={
            focus === "xray"
              ? "24h X-ray · hourly peak class"
              : "24h planetary Kp · observed"
          }
        />
        <div className="hcr-box">
          <h4>NOAA storm scales</h4>
          {scales ? (
            <div className="hcr-list">
              {(
                [
                  ["G", scales.geomagnetic_storm.scale ?? 0],
                  ["S", scales.solar_radiation.scale ?? 0],
                  ["R", scales.radio_blackout.scale ?? 0],
                ] as const
              ).map(([letter, level]) => (
                <div
                  key={letter}
                  className={`hcr-item ${
                    level >= 3 ? "hc-bad" : level >= 1 ? "hc-warn" : "hc-good"
                  }`}
                >
                  <b>
                    {letter}
                    {level}
                  </b>
                  <span>{SCALE_LABEL[letter]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hcr-note">
              NOAA has not published a scale set for this hour.
            </p>
          )}
        </div>
      </div>
    </WallReport>
  );
}
