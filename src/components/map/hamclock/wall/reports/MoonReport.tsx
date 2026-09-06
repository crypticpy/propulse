import { useId, useMemo, useState } from "react";
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
  getSublunarPoint,
} from "@/lib/utils/moon";
import { useMapStore } from "@/stores/mapStore";
import { HamClockSegmented } from "../controls/HamClockSegmented";
import { HamClockTabs } from "../controls/HamClockTabs";
import { MoonGlyph } from "../tiles/MoonTile";
import { formatClock, formatCountdown, reportFooter } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

const TICK_MS = 60_000;
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

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
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
  const width = 300;
  const height = 88;
  const left = 28;
  const right = 8;
  const top = 10;
  const bottom = 16;
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
      <p className="hcr-chart-title">MOON ELEVATION — 24 H · COMPUTED AT QTH</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-title`}
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
          strokeWidth="2"
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
          y={height - 2}
          fill="var(--hcr-chart-dim, #cbd5e1)"
          fontSize="9"
        >
          00Z
        </text>
        <text
          x={width - right}
          y={height - 2}
          textAnchor="end"
          fill="var(--hcr-chart-dim, #cbd5e1)"
          fontSize="9"
        >
          24Z
        </text>
      </svg>
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
 * 28 days of EME degradation from `from`, one line combining the distance
 * loss (`degradationDb`) and the sky-noise penalty at `band`: the sky-noise
 * term is expressed in the same dB scale as a signal-to-noise cost, relative
 * to a cold-sky night (galactic latitude 90 -- the galactic pole itself, the
 * one galactic latitude guaranteed to sit outside the near-plane threshold
 * regardless of what that threshold is set to), so it can be subtracted
 * straight from the distance term.
 */
function emeDegradationCurve(
  lat: number,
  lon: number,
  from: Date,
  band: EmeBand,
): EmeDaySample[] {
  const coldSkyBaselineK = skyNoiseTempK(90, band);
  return Array.from({ length: 28 }, (_, day) => {
    const at = new Date(from.getTime() + day * DAY_MS);
    const distanceKm = getMoonConditions(at, lat, lon).distanceKm;
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
  const width = 300;
  const height = 100;
  const left = 30;
  const right = 8;
  const top = 14;
  const bottom = 20;
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
      <p className="hcr-chart-title">EME DEGRADATION — 28 D · COMPUTED</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>
          EME degradation over 28 days, combining distance loss and sky
          noise, with perigee and apogee marked.
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
          strokeWidth="2"
        />
        {[
          { idx: perigeeIdx, label: "PERIGEE" },
          { idx: apogeeIdx, label: "APOGEE" },
        ].map(({ idx, label }) => {
          const point = curve[idx];
          const px = x(point.at.getTime());
          const py = y(point.combinedDb);
          return (
            <g key={label}>
              <circle cx={px} cy={py} r="3" fill="var(--hcr-chart-warn, #fbbf24)" />
              <text
                x={px}
                y={Math.max(top - 4, py - 8)}
                textAnchor="middle"
                fill="var(--hcr-chart-warn, #fde68a)"
                fontSize="8"
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
          y={height - 4}
          fill="var(--hcr-chart-dim, #cbd5e1)"
          fontSize="9"
        >
          {dateOnly(curve[0].at)}
        </text>
        <text
          x={width - right}
          y={height - 4}
          textAnchor="end"
          fill="var(--hcr-chart-dim, #cbd5e1)"
          fontSize="9"
        >
          {dateOnly(curve[curve.length - 1].at)}
        </text>
      </svg>
      <table className="sr-only">
        <caption>
          EME degradation by day, combining distance loss and sky noise
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
    () => (location ? moonElevationCurve(location.lat, location.lon, now) : null),
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

  if (!location || !moon || !snapshot || rangeRateKmS === null || !moonCurve || !emeCurve) {
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
  const minutesUntilSet = moon.set
    ? (moon.set.getTime() - now.getTime()) / 60_000
    : null;
  const minutesUntilRise = moon.rise
    ? (moon.rise.getTime() - now.getTime()) / 60_000
    : null;
  const hero = moonUp
    ? minutesUntilSet !== null
      ? formatCountdown(Math.max(0, minutesUntilSet))
      : "—"
    : minutesUntilRise !== null
      ? formatCountdown(Math.max(0, minutesUntilRise))
      : "—";
  const verdict = moonUp ? "MOON UP" : "MOON DOWN";
  const tone: "accent" | "info" = moonUp ? "accent" : "info";

  const pathLoss = pathLossDb(moon.distanceKm, band);
  const degradation = degradationDb(moon.distanceKm, band);
  const declWord = declinationWord(declinationDeg);
  const skyK = skyNoiseTempK(galacticLatitudeDeg, band);
  const skyWord = skyNoiseWord(galacticLatitudeDeg);
  const doppler = dopplerShiftHz(rangeRateKmS, band);

  const mutualWindowValue = !target
    ? "NO TARGET SET"
    : !mutualWindow
      ? "NONE IN 24 H"
      : mutualWindow.active
        ? "ACTIVE NOW"
        : `IN ${formatCountdown((mutualWindow.start.getTime() - now.getTime()) / 60_000)}`;

  const facts: WallReportFact[] = [
    {
      label: "PHASE",
      value: `${moon.phaseName.toUpperCase()} · ${Math.round(moon.illumination * 100)}%`,
    },
    {
      label: "ALT / AZ",
      value: `${moon.altitude.toFixed(1)}° / ${moon.azimuth.toFixed(1)}°`,
    },
    { label: "MOONRISE", value: bothClocks(moon.rise, zone) },
    { label: "MOONSET", value: bothClocks(moon.set, zone) },
    { label: "DISTANCE", value: `${Math.round(moon.distanceKm)} km` },
    { label: "PATH LOSS", value: `${pathLoss.toFixed(1)} dB` },
    { label: "DEGRADATION", value: signedDb(degradation) },
    { label: "DECLINATION", value: `${declinationDeg.toFixed(1)}° ${declWord}` },
    { label: "SKY NOISE", value: `${Math.round(skyK)} K · ${skyWord}` },
    { label: "MUTUAL WINDOW", value: mutualWindowValue },
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
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>Moon · {moonUp ? "up" : "down"}</h4>
          <div className="hcr-media">
            <MoonGlyph phase={moon.phase} />
            <dl className="hcr-kv">
              <dt>ILLUMINATED</dt>
              <dd>{Math.round(moon.illumination * 100)}%</dd>
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
            <dt>MUTUAL WINDOW</dt>
            <dd>{mutualWindowValue}</dd>
          </dl>
        </div>
      </div>
      <HamClockTabs
        label="Moon report view"
        defaultActive="moon"
        tabs={[
          {
            id: "moon",
            label: "MOON",
            content: <MoonElevationChart curve={moonCurve} now={now} />,
          },
          {
            id: "eme",
            label: "EME",
            content: <EmeDegradationChart curve={emeCurve} now={now} />,
          },
        ]}
      />
    </WallReport>
  );
}
