import { useId, useMemo, useRef, useState } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  EME_BAND_FREQUENCY_MHZ,
  EME_BANDS,
  declinationWord,
  degradationDb,
  dopplerShiftHz,
  getMutualMoonWindow,
  pathLossDb,
  skyNoiseTempK,
  skyNoiseWord,
  type EmeBand,
} from "@/lib/utils/eme";
import {
  getMoonConditions,
  getMoonDeclinationDeg,
  getMoonGalacticLatitudeDeg,
  getMoonRangeRateKmS,
  getMoonSnapshot,
  getMoonTopocentricRangeKm,
  getSublunarPoint,
} from "@/lib/utils/moon";
import { useMapStore } from "@/stores/mapStore";
import { HamClockSegmented } from "../controls/HamClockSegmented";
import { HamClockTabs } from "../controls/HamClockTabs";
import { MoonGlyph } from "../tiles/MoonTile";
import { formatClock, formatCountdown, reportFooter } from "../tokens";
import { useElementSize } from "../useElementSize";
import { WallReport, type WallReportFact } from "./WallReport";

const TICK_MS = 60_000;
/** Drawing size before the slot has been measured (jsdom, first paint). */
const CHART_FALLBACK = { width: 720, height: 220 };
const DAY_MS = 24 * 60 * 60 * 1000;

const BAND_OPTIONS = EME_BANDS.map((band) => ({
  value: band,
  label: band.toUpperCase(),
  detail: `${EME_BAND_FREQUENCY_MHZ[band]} MHZ`,
}));

/** "07:12 / 12:12Z" — local and UTC together, per the style guide's clock
 * rule (section 6): a wall reader must never see one without the other. */
function bothClocks(value: Date | null, zone: string | undefined): string {
  if (!value) return "—";
  return `${formatClock(value, zone)} / ${formatClock(value, "UTC")}Z`;
}

/** The local clock alone, for a fact whose UTC twin sits in the body. */
function localClock(value: Date | null, zone: string | undefined): string {
  return value ? formatClock(value, zone) : "—";
}

/** "+1.2 dB", "−1.8 dB", "0.0 dB" — dB shown signed with one decimal
 * (section 6). */
function signedDb(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0 dB";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1)} dB`;
}

/** "+53 Hz", "−53 Hz", "0 Hz" — Hz shown as a signed integer (section 6). */
function signedHz(value: number): string {
  const rounded = Math.round(Math.abs(value));
  if (rounded === 0) return "0 Hz";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${rounded} Hz`;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** "2 H 10 MIN", "25 MIN" — a duration spelled out uppercase and short, for
 * the mutual-window fact (finding 5): a wall reader needs "how long is left
 * or how long the window runs," not just a start/end clock pair. */
function formatDurationLeft(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins} MIN`;
  return `${hours} H ${mins} MIN`;
}

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * The next real moonrise and moonset strictly after `at`, for the hero
 * countdown. `SunCalc.getMoonTimes` is scoped to one calendar day and can
 * omit an event entirely (the Moon up or down all day) or return that day's
 * own event even once it is already in the past -- when a moon-up interval
 * crosses local midnight, today's `set` can be this morning's already-passed
 * crossing while the Moon rose again this evening, and the reverse for
 * `rise` while the Moon is down. Scanning yesterday, today and tomorrow and
 * keeping only crossings after `at` means the hero always counts down to a
 * real future event instead of clamping a negative interval to zero.
 */
function nextMoonCrossings(
  at: Date,
  lat: number,
  lon: number,
): { nextRise: Date | null; nextSet: Date | null } {
  let nextRise: Date | null = null;
  let nextSet: Date | null = null;
  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
    const day = new Date(at.getTime() + dayOffset * DAY_MS);
    const times = SunCalc.getMoonTimes(day, lat, lon, true);
    if (
      times.rise instanceof Date &&
      times.rise.getTime() > at.getTime() &&
      (!nextRise || times.rise.getTime() < nextRise.getTime())
    ) {
      nextRise = times.rise;
    }
    if (
      times.set instanceof Date &&
      times.set.getTime() > at.getTime() &&
      (!nextSet || times.set.getTime() < nextSet.getTime())
    ) {
      nextSet = times.set;
    }
  }
  return { nextRise, nextSet };
}

/** One hourly sample of the Moon's elevation, 0-23 UTC on the reference day. */
interface MoonHourSample {
  hour: number;
  at: Date;
  altitudeDeg: number;
}

/**
 * The Moon's own 24 h elevation curve (wall spec section 26.10's MOON tab
 * chart). There is no shared `moonCurve.ts` yet -- `sunCurve.ts` computes an
 * equivalent curve for the Sun report (B20) -- so this stays a small local
 * sampler rather than a new lib file for one report's chart.
 */
function moonElevationCurve(
  lat: number,
  lon: number,
  date: Date,
): MoonHourSample[] {
  const dayStart = utcMidnight(date);
  return Array.from({ length: 24 }, (_, hour) => {
    const at = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
    const altitudeDeg =
      SunCalc.getMoonPosition(at, lat, lon).altitude * (180 / Math.PI);
    return { hour, at, altitudeDeg };
  });
}

/**
 * 24 h Moon elevation, horizon at zero, with a now marker — the report's own
 * chart, in the same visual language as `SunElevationChart`
 * (`SunReport.tsx`, B20): 300x88 viewBox, `--hcr-chart-*` tokens with hex
 * fallbacks, mono captions.
 */
function MoonElevationChart({
  curve,
  now,
}: {
  curve: MoonHourSample[];
  now: Date;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || CHART_FALLBACK.width;
  const height = measured.height || CHART_FALLBACK.height;
  const vh =
    typeof window === "undefined"
      ? CHART_FALLBACK.height / 72
      : window.innerHeight / 100;
  const fs = Math.max(11, Math.round(vh * 1.45));
  const left = Math.round(fs * 3.2);
  const right = Math.round(fs * 1.2);
  const top = Math.round(fs * 0.6);
  const bottom = Math.round(fs * 1.4);
  const dayStart = curve[0].at.getTime();
  const dayEnd = dayStart + DAY_MS;

  const values = curve.map((p) => p.altitudeDeg);
  const pad = Math.max(6, (Math.max(...values) - Math.min(...values)) * 0.12);
  const lo = Math.min(0, ...values) - pad;
  const hi = Math.max(0, ...values) + pad;

  const x = (t: number) =>
    left + ((t - dayStart) / (dayEnd - dayStart)) * (width - left - right);
  const y = (v: number) =>
    top + (1 - (v - lo) / (hi - lo)) * (height - top - bottom);

  const path = curve
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.at.getTime()).toFixed(1)},${y(p.altitudeDeg).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div className="hcr-chart">
      <p className="hcr-chart-title">MOON ELEVATION — 24 H · AT QTH</p>
      <figure className="hcr-plot" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-labelledby={`${id}-title`}
          fontFamily="var(--hc-font-mono, monospace)"
          fontSize={fs}
        >
          <title id={`${id}-title`}>
            Moon elevation over 24 hours UTC, with the current hour marked.
          </title>
          <line
            x1={left}
            x2={width - right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--hcr-chart-axis, #94a3b8)"
            strokeDasharray="4 4"
          />
          <path
            d={path}
            fill="none"
            stroke="var(--hcr-chart-observed, #44ddff)"
            strokeWidth={Math.max(2, fs * 0.16)}
          />
          {curve.map((point, i) => {
            const next = curve[i + 1]?.at.getTime() ?? dayEnd;
            return (
              <rect
                key={point.hour}
                x={x(point.at.getTime())}
                y={top}
                width={Math.max(0, x(next) - x(point.at.getTime()))}
                height={height - top - bottom}
                fill="transparent"
              >
                <title>
                  {formatClock(point.at, "UTC")}Z —{" "}
                  {Math.round(point.altitudeDeg)}
                  {"°"} elevation
                </title>
              </rect>
            );
          })}
          {now.getTime() >= dayStart && now.getTime() <= dayEnd && (
            <line
              x1={x(now.getTime())}
              x2={x(now.getTime())}
              y1={top}
              y2={height - bottom}
              stroke="var(--hcr-chart-now, #f8fafc)"
              strokeDasharray="2 4"
            />
          )}
          <text
            x={left}
            y={height - fs * 0.3}
            fill="var(--hcr-chart-dim, #cbd5e1)"
          >
            00Z
          </text>
          <text
            x={width - right}
            y={height - fs * 0.3}
            textAnchor="end"
            fill="var(--hcr-chart-dim, #cbd5e1)"
          >
            24Z
          </text>
        </svg>
      </figure>
      <table className="sr-only">
        <caption>Moon elevation by UTC hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour (UTC)</th>
            <th scope="col">Elevation</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((point) => (
            <tr key={point.hour}>
              <td>{String(point.hour).padStart(2, "0")}Z</td>
              <td>{Math.round(point.altitudeDeg)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One daily sample of the EME degradation curve. */
interface EmeDaySample {
  day: number;
  at: Date;
  distanceKm: number;
  combinedDb: number;
}

/**
 * 28 days of EME degradation from `from`'s UTC midnight, one line combining
 * the distance loss (`degradationDb`) and the sky-noise penalty at `band`:
 * the sky-noise term is expressed in the same dB scale as a
 * signal-to-noise cost, relative to a cold-sky night (galactic latitude 90
 * -- the galactic pole itself, the one galactic latitude guaranteed to sit
 * outside the near-plane threshold regardless of what that threshold is set
 * to), so it can be subtracted straight from the distance term. Each day is
 * evaluated at its own UTC midnight rather than at `from`'s time-of-day (the
 * report has no per-day transit instant on hand), and uses the topocentric
 * range (`getMoonTopocentricRangeKm`) rather than the geocentric distance --
 * see `eme.ts`'s module docblock for why that matters once range is raised
 * to the fourth power.
 */
function emeDegradationCurve(
  lat: number,
  lon: number,
  from: Date,
  band: EmeBand,
): EmeDaySample[] {
  const coldSkyBaselineK = skyNoiseTempK(90, band);
  const dayStart = utcMidnight(from);
  return Array.from({ length: 28 }, (_, day) => {
    const at = new Date(dayStart.getTime() + day * DAY_MS);
    const distanceKm = getMoonTopocentricRangeKm(at, lat, lon);
    const galacticLatitudeDeg = getMoonGalacticLatitudeDeg(at);
    const skyPenaltyDb =
      10 *
      Math.log10(skyNoiseTempK(galacticLatitudeDeg, band) / coldSkyBaselineK);
    return {
      day,
      at,
      distanceKm,
      combinedDb: degradationDb(distanceKm, band) - skyPenaltyDb,
    };
  });
}

/**
 * 28 d EME degradation, perigee and apogee labelled and a now marker — the
 * EME tab's own chart, same visual language as `MoonElevationChart` above.
 */
function EmeDegradationChart({
  curve,
  now,
}: {
  curve: EmeDaySample[];
  now: Date;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || CHART_FALLBACK.width;
  const height = measured.height || CHART_FALLBACK.height;
  const vh =
    typeof window === "undefined"
      ? CHART_FALLBACK.height / 72
      : window.innerHeight / 100;
  const fs = Math.max(11, Math.round(vh * 1.45));
  const left = Math.round(fs * 3.2);
  const right = Math.round(fs * 1.2);
  const top = Math.round(fs * 1.6);
  const bottom = Math.round(fs * 1.4);
  const start = curve[0].at.getTime();
  const end = curve[curve.length - 1].at.getTime() + DAY_MS;

  const values = curve.map((p) => p.combinedDb);
  const lo = Math.min(...values) - 0.3;
  const hi = 0.3;

  const x = (t: number) =>
    left + ((t - start) / (end - start)) * (width - left - right);
  const y = (v: number) =>
    top + (1 - (v - lo) / (hi - lo)) * (height - top - bottom);

  const path = curve
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.at.getTime()).toFixed(1)},${y(p.combinedDb).toFixed(1)}`,
    )
    .join(" ");

  let perigeeIdx = 0;
  let apogeeIdx = 0;
  curve.forEach((p, i) => {
    if (p.distanceKm < curve[perigeeIdx].distanceKm) perigeeIdx = i;
    if (p.distanceKm > curve[apogeeIdx].distanceKm) apogeeIdx = i;
  });

  return (
    <div className="hcr-chart">
      <p className="hcr-chart-title">
        EME DEGRADATION — 28 D · AT UTC MIDNIGHT
      </p>
      <figure className="hcr-plot" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-labelledby={`${id}-title`}
          fontFamily="var(--hc-font-mono, monospace)"
          fontSize={fs}
        >
          <title id={`${id}-title`}>
            EME degradation over 28 days at UTC midnight, combining distance
            loss and sky noise, with perigee and apogee marked.
          </title>
          <line
            x1={left}
            x2={width - right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--hcr-chart-axis, #94a3b8)"
            strokeDasharray="4 4"
          />
          <path
            d={path}
            fill="none"
            stroke="var(--hcr-chart-observed, #44ddff)"
            strokeWidth={Math.max(2, fs * 0.16)}
          />
          {curve.map((point, i) => {
            const next = curve[i + 1]?.at.getTime() ?? end;
            return (
              <rect
                key={point.day}
                x={x(point.at.getTime())}
                y={top}
                width={Math.max(0, x(next) - x(point.at.getTime()))}
                height={height - top - bottom}
                fill="transparent"
              >
                <title>
                  {dateOnly(point.at)} · {signedDb(point.combinedDb)}
                </title>
              </rect>
            );
          })}
          {[
            { idx: perigeeIdx, label: "PERIGEE" },
            { idx: apogeeIdx, label: "APOGEE" },
          ].map(({ idx, label }) => {
            const point = curve[idx];
            const px = x(point.at.getTime());
            const py = y(point.combinedDb);
            return (
              <g key={label}>
                <circle
                  cx={px}
                  cy={py}
                  r={Math.max(3, fs * 0.25)}
                  fill="var(--hcr-chart-warn, #fbbf24)"
                />
                <text
                  x={px}
                  y={Math.max(fs, py - fs * 0.6)}
                  textAnchor="middle"
                  fill="var(--hcr-chart-warn, #fde68a)"
                  fontSize={fs * 0.85}
                >
                  {label}
                </text>
              </g>
            );
          })}
          {now.getTime() >= start && now.getTime() <= end && (
            <line
              x1={x(now.getTime())}
              x2={x(now.getTime())}
              y1={top}
              y2={height - bottom}
              stroke="var(--hcr-chart-now, #f8fafc)"
              strokeDasharray="2 4"
            />
          )}
          <text
            x={left}
            y={height - fs * 0.3}
            fill="var(--hcr-chart-dim, #cbd5e1)"
          >
            {dateOnly(curve[0].at)}
          </text>
          <text
            x={width - right}
            y={height - fs * 0.3}
            textAnchor="end"
            fill="var(--hcr-chart-dim, #cbd5e1)"
          >
            {dateOnly(curve[curve.length - 1].at)}
          </text>
        </svg>
      </figure>
      <table className="sr-only">
        <caption>
          EME degradation by day at UTC midnight, combining distance loss and
          sky noise
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Degradation</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((p) => (
            <tr key={p.day}>
              <td>{dateOnly(p.at)}</td>
              <td>{signedDb(p.combinedDb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface MoonReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The Moon's own report behind the Moon tile (wall spec section 26.10):
 * phase, illumination and rise/set on the `MOON` tab, and the EME link
 * budget -- path loss, degradation against perigee, declination, sky noise,
 * Doppler and the mutual moon-up window with a DX target -- on the `EME`
 * tab. This is not a model report (section 26.0): there is no physics vs
 * observed comparison here, only one computed value per fact.
 */
export function MoonReport({ open, onClose }: MoonReportProps) {
  const location = useActiveLocation();
  const target = useMapStore((s) => s.target);
  const setCenterLocation = useMapStore((s) => s.setCenterLocation);
  const now = useUTCClock(TICK_MS);
  const [band, setBand] = useState<EmeBand>("2m");

  const moon = useMemo(
    () =>
      location
        ? getMoonConditions(now, location.lat, location.lon, location.timezone)
        : null,
    [location, now],
  );
  const snapshot = useMemo(
    () => (location ? getMoonSnapshot(now, location.lat, location.lon) : null),
    [location, now],
  );
  const declinationDeg = useMemo(() => getMoonDeclinationDeg(now), [now]);
  const galacticLatitudeDeg = useMemo(
    () => getMoonGalacticLatitudeDeg(now),
    [now],
  );
  const rangeRateKmS = useMemo(
    () =>
      location ? getMoonRangeRateKmS(now, location.lat, location.lon) : null,
    [location, now],
  );
  const mutualWindow = useMemo(
    () =>
      location && target
        ? getMutualMoonWindow(
            location.lat,
            location.lon,
            target.lat,
            target.lon,
            now,
          )
        : null,
    [location, target, now],
  );
  const moonCurve = useMemo(
    () =>
      location ? moonElevationCurve(location.lat, location.lon, now) : null,
    [location, now],
  );
  const emeCurve = useMemo(
    () =>
      location
        ? emeDegradationCurve(location.lat, location.lon, now, band)
        : null,
    [location, now, band],
  );
  const sublunarPoint = useMemo(() => getSublunarPoint(now), [now]);

  if (
    !location ||
    !moon ||
    !snapshot ||
    rangeRateKmS === null ||
    !moonCurve ||
    !emeCurve
  ) {
    const idle = reportFooter("MOON.TS · DE", null);
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Moon report"
        hero="—"
        verdict="NO QTH"
        footer={idle.footer}
        updated={idle.updated}
      >
        <p className="hcr-note">
          Set your operating location to see the Moon and the EME link budget
          from your own horizon.
        </p>
      </WallReport>
    );
  }

  const zone = location.timezone;
  const moonUp = moon.altitude > 0;
  const { nextRise, nextSet } = nextMoonCrossings(
    now,
    location.lat,
    location.lon,
  );
  const minutesUntilNextSet = nextSet
    ? (nextSet.getTime() - now.getTime()) / 60_000
    : null;
  const minutesUntilNextRise = nextRise
    ? (nextRise.getTime() - now.getTime()) / 60_000
    : null;
  const hero = moonUp
    ? minutesUntilNextSet !== null
      ? formatCountdown(minutesUntilNextSet)
      : "—"
    : minutesUntilNextRise !== null
      ? formatCountdown(minutesUntilNextRise)
      : "—";
  const verdict = moonUp ? "MOON UP" : "MOON DOWN";
  const tone: "accent" | "info" = moonUp ? "accent" : "info";

  // Topocentric range: the actual slant distance a signal travels, unlike
  // `moon.distanceKm` (geocentric -- see `moon.ts`'s docblock). Path loss and
  // degradation both raise range to the fourth power (`eme.ts`), so this
  // difference is not cosmetic.
  const topoDistanceKm = getMoonTopocentricRangeKm(
    now,
    location.lat,
    location.lon,
  );
  const pathLoss = pathLossDb(topoDistanceKm, band);
  const degradation = degradationDb(topoDistanceKm, band);
  const declWord = declinationWord(declinationDeg);
  const skyK = skyNoiseTempK(galacticLatitudeDeg, band);
  const skyWord = skyNoiseWord(galacticLatitudeDeg);
  const doppler = dopplerShiftHz(rangeRateKmS, band);

  const mutualWindowValue = !target
    ? "NO TARGET SET"
    : !mutualWindow
      ? "NONE IN 24 H"
      : mutualWindow.active
        ? `ACTIVE NOW · ENDS ${formatClock(mutualWindow.end, "UTC")} UTC · ${formatDurationLeft(
            (mutualWindow.end.getTime() - now.getTime()) / 60_000,
          )} LEFT`
        : `OPENS ${formatClock(mutualWindow.start, "UTC")} UTC · CLOSES ${formatClock(
            mutualWindow.end,
            "UTC",
          )} UTC · ${formatDurationLeft(
            (mutualWindow.end.getTime() - mutualWindow.start.getTime()) /
              60_000,
          )}`;

  // Each fact fits its half of the facts column beside a two-word hero at
  // 1080p (label + value ≤ ~19 mono characters, #250 rendered check): the
  // phase name heads the Moon box, rise and set show the local clock here
  // and both clocks in the box, and the elevation and azimuth are whole
  // degrees.
  const facts: WallReportFact[] = [
    { label: "ILLUM", value: `${Math.round(moon.illumination * 100)}%` },
    {
      label: "ALT / AZ",
      value: `${Math.round(moon.altitude)}° / ${Math.round(moon.azimuth)}°`,
    },
    // Next crossings, not SunCalc's calendar-day pair: a day without a
    // moonrise otherwise reads "—" while the Moon is plainly due tomorrow.
    { label: "RISE", value: localClock(nextRise, zone) },
    { label: "SET", value: localClock(nextSet, zone) },
    {
      label: "RANGE",
      value: `${Math.round(topoDistanceKm).toLocaleString("en-US")} km`,
    },
    { label: "DECL", value: `${declinationDeg.toFixed(1)}° ${declWord}` },
  ];

  const { footer, updated } = reportFooter(
    "SUNCALC + EME.TS AT THE ACTIVE QTH · LOCAL CLOCK",
    now,
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Moon report · ${location.name || location.grid || "DE"}`}
      tone={tone}
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="moon-report"
      pinElement={<MoonReport open onClose={onClose} />}
    >
      <HamClockTabs
        label="Moon report view"
        defaultActive="moon"
        tabs={[
          {
            id: "moon",
            label: "MOON",
            content: (
              <div className="hcr-cols hcr-cols--fill">
                <div className="hcr-box">
                  <h4>
                    {moon.phaseName} · {moonUp ? "up" : "down"}
                  </h4>
                  <div className="hcr-media">
                    <MoonGlyph phase={moon.phase} />
                    <dl className="hcr-kv">
                      <dt>MOONRISE</dt>
                      <dd>{bothClocks(nextRise, zone)}</dd>
                      <dt>MOONSET</dt>
                      <dd>{bothClocks(nextSet, zone)}</dd>
                      <dt>NEXT FULL</dt>
                      <dd>{dateOnly(snapshot.nextFullMoon)}</dd>
                      <dt>NEXT NEW</dt>
                      <dd>{dateOnly(snapshot.nextNewMoon)}</dd>
                    </dl>
                  </div>
                  <button
                    type="button"
                    className="hcr-link-button"
                    onClick={() => {
                      setCenterLocation(sublunarPoint.lat, sublunarPoint.lon);
                      onClose();
                    }}
                  >
                    SHOW SUB-LUNAR POINT
                  </button>
                </div>
                <div className="hcr-box">
                  <MoonElevationChart curve={moonCurve} now={now} />
                </div>
              </div>
            ),
          },
          {
            id: "eme",
            label: "EME",
            content: (
              <div className="hcr-cols hcr-cols--fill">
                <div className="hcr-box">
                  <h4>EME · {band.toUpperCase()}</h4>
                  <HamClockSegmented
                    label="Band"
                    hideLabel
                    options={BAND_OPTIONS}
                    value={band}
                    onChange={setBand}
                  />
                  <dl className="hcr-kv">
                    <dt>PATH LOSS</dt>
                    <dd>{pathLoss.toFixed(1)} dB</dd>
                    <dt>DOPPLER</dt>
                    <dd>{signedHz(doppler)}</dd>
                    <dt>SKY NOISE</dt>
                    <dd>
                      {Math.round(skyK)} K · {skyWord}
                    </dd>
                    <dt>DEGRADATION</dt>
                    <dd>{signedDb(degradation)}</dd>
                    <dt>MUTUAL WINDOW</dt>
                    <dd>{mutualWindowValue}</dd>
                  </dl>
                </div>
                <div className="hcr-box">
                  <EmeDegradationChart curve={emeCurve} now={now} />
                </div>
              </div>
            ),
          },
        ]}
      />
    </WallReport>
  );
}
