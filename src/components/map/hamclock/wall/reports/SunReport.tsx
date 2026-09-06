import { lazy, Suspense, useId, useMemo, useState } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  getNextSunEvent,
  getSunCurve,
  type SunCurve,
  type TwilightPhase,
} from "@/lib/hamclock/sunCurve";
import { formatClock, formatCountdown, reportFooter } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

// Grey line is a sibling report, not a nested route, so it can share this
// dialog's chunk on demand without pulling GreyLineReport into every report
// that opens first.
const GreyLineReport = lazy(() =>
  import("./GreyLineReport").then((m) => ({ default: m.GreyLineReport })),
);

const TICK_MS = 60_000;
const RAD_TO_DEG = 180 / Math.PI;

const TWILIGHT_LABEL: Record<TwilightPhase, string> = {
  civil: "Civil",
  nautical: "Nautical",
  astronomical: "Astronomical",
};

/** Every twilight band's CSS class, narrowest (civil) to widest
 * (astronomical) — the chart paints them in this order so the widest band
 * only shows through at the outer edges. */
const TWILIGHT_BAND_ORDER: TwilightPhase[] = [
  "astronomical",
  "nautical",
  "civil",
];

/** "07:12 / 12:12Z" — local and UTC together, per the style guide's clock
 * rule (section 6): a wall reader must never see one without the other. */
function bothClocks(value: Date | null, zone: string | undefined): string {
  if (!value) return "—";
  return `${formatClock(value, zone)} / ${formatClock(value, "UTC")}Z`;
}

/** "+2M 14S", "−1M 03S" — the signed minutes-and-seconds format section 6
 * calls for on a delta this small; a whole-minute rounding would show "+0M"
 * on most days near the solstices. */
function signedMinSec(minutes: number | null): string {
  if (minutes === null) return "—";
  if (Math.abs(minutes) < 1 / 120) return "±0S";
  const sign = minutes > 0 ? "+" : "−";
  const totalSeconds = Math.round(Math.abs(minutes) * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${sign}${m}M ${String(s).padStart(2, "0")}S` : `${sign}${s}S`;
}

function twilightRange(window: SunCurve["twilights"][number]): string {
  if (!window.start || !window.end) return "—";
  return `${formatClock(window.start, "UTC")}–${formatClock(window.end, "UTC")}Z`;
}

/**
 * 24 h elevation curve, horizon at zero, with the three twilight bands
 * shaded and a now marker — the report's own chart, since neither
 * `SolarMiniChart` nor `SolarSeriesChart` can paint a shaded time band. Kept
 * in the same visual language: 300x88 viewBox, `--hcr-chart-*` tokens with
 * hex fallbacks, mono captions.
 */
function SunElevationChart({ curve, now }: { curve: SunCurve; now: Date }) {
  const id = useId();
  const width = 300;
  const height = 88;
  const left = 28;
  const right = 8;
  const top = 10;
  const bottom = 16;
  const dayStart = curve.points[0].at.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const values = curve.points.map((p) => p.elevationDeg);
  const pad = Math.max(6, (Math.max(...values) - Math.min(...values)) * 0.12);
  const lo = Math.min(0, ...values) - pad;
  const hi = Math.max(0, ...values) + pad;

  const x = (t: number) =>
    left + ((t - dayStart) / (dayEnd - dayStart)) * (width - left - right);
  const y = (v: number) =>
    top + (1 - (v - lo) / (hi - lo)) * (height - top - bottom);

  const path = curve.points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.at.getTime()).toFixed(1)},${y(p.elevationDeg).toFixed(1)}`,
    )
    .join(" ");

  const bandOpacity: Record<TwilightPhase, number> = {
    astronomical: 0.28,
    nautical: 0.19,
    civil: 0.1,
  };

  const clampX = (t: number) => Math.min(dayEnd, Math.max(dayStart, t));

  return (
    <figure className="mt-4 min-w-0 border-t border-white/10 pt-3">
      <figcaption className="mb-1 text-xs text-slate-300">
        SUN ELEVATION — 24 H · COMPUTED AT QTH
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>
          Sun elevation over 24 hours UTC, with civil, nautical and astronomical
          twilight shaded and the current hour marked.
        </title>
        {TWILIGHT_BAND_ORDER.map((phase) => {
          const window = curve.twilights.find((w) => w.phase === phase);
          if (!window?.start || !window.end) return null;
          const bandX = x(clampX(window.start.getTime()));
          const bandEnd = x(clampX(window.end.getTime()));
          if (bandEnd <= bandX) return null;
          return (
            <rect
              key={phase}
              x={bandX}
              y={top}
              width={bandEnd - bandX}
              height={height - top - bottom}
              fill={`rgb(var(--hc-info-rgb) / ${bandOpacity[phase]})`}
            />
          );
        })}
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
        {curve.points.map((point, i) => {
          const next = curve.points[i + 1]?.at.getTime() ?? dayEnd;
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
                {Math.round(point.elevationDeg)}
                {"°"} elevation, {Math.round(point.azimuthDeg)}
                {"°"} azimuth
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
        <caption>Sun elevation and azimuth by UTC hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour (UTC)</th>
            <th scope="col">Elevation</th>
            <th scope="col">Azimuth</th>
          </tr>
        </thead>
        <tbody>
          {curve.points.map((point) => (
            <tr key={point.hour}>
              <td>{String(point.hour).padStart(2, "0")}Z</td>
              <td>{Math.round(point.elevationDeg)}°</td>
              <td>{Math.round(point.azimuthDeg)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface SunReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The sun's own report behind the sunrise/sunset tile (wall spec section
 * 26.8): rise, noon and set in local and UTC, the three twilight windows,
 * the day-length trend versus yesterday, and the 24 h elevation curve. The
 * grey-line window gets one line and a link rather than being repeated here.
 */
export function SunReport({ open, onClose }: SunReportProps) {
  const location = useActiveLocation();
  const now = useUTCClock(TICK_MS);
  const [greylineOpen, setGreylineOpen] = useState(false);

  const curve = useMemo(
    () => (location ? getSunCurve(location.lat, location.lon, now) : null),
    [location, now],
  );
  const nextEvent = useMemo(
    () => (location ? getNextSunEvent(location.lat, location.lon, now) : null),
    [location, now],
  );

  if (!location || !curve) {
    const idle = reportFooter("SUNCALC · DE", null);
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Sun report"
        hero="—"
        verdict="NO QTH"
        footer={idle.footer}
        updated={idle.updated}
      >
        <p className="hcr-note">
          Set your operating location to see sunrise, sunset and the elevation
          curve from your own horizon.
        </p>
      </WallReport>
    );
  }

  const zone = location.timezone;
  const nowPosition = SunCalc.getPosition(now, location.lat, location.lon);
  const elevationNow = nowPosition.altitude * RAD_TO_DEG;
  const azimuthNow =
    (((nowPosition.azimuth * RAD_TO_DEG + 180) % 360) + 360) % 360;
  const isDaylight = elevationNow > 0;

  const { dayState } = curve;
  const civil = curve.twilights.find((w) => w.phase === "civil");
  const nautical = curve.twilights.find((w) => w.phase === "nautical");
  const astronomical = curve.twilights.find((w) => w.phase === "astronomical");

  let hero: string;
  let verdict: string;
  const tone: "accent" | "info" = isDaylight ? "accent" : "info";
  if (dayState.polarDay || dayState.polarNight) {
    verdict = dayState.polarDay ? "SUN DOES NOT SET" : "SUN DOES NOT RISE";
    hero = dayState.nextTransition
      ? formatCountdown(
          (dayState.nextTransition.getTime() - now.getTime()) / 60_000,
        )
      : "—";
  } else if (nextEvent) {
    verdict = nextEvent.type === "sunrise" ? "SUNRISE" : "SUNSET";
    hero = formatCountdown((nextEvent.at.getTime() - now.getTime()) / 60_000);
  } else {
    verdict = "NO EVENT";
    hero = "—";
  }

  const facts: WallReportFact[] = [
    { label: "RISE", value: bothClocks(curve.rise, zone) },
    { label: "NOON", value: bothClocks(curve.noon, zone) },
    { label: "SET", value: bothClocks(curve.set, zone) },
    {
      label: "DAY LENGTH",
      value:
        curve.dayLengthMin === null ? "—" : formatCountdown(curve.dayLengthMin),
    },
    { label: "CHANGE", value: signedMinSec(curve.dayLengthDeltaMin) },
    {
      label: "ELEV / AZ NOW",
      value: `${Math.round(elevationNow)}° / ${Math.round(azimuthNow)}°`,
    },
  ];

  const { footer, updated } = reportFooter(
    "SUNCALC AT THE ACTIVE QTH · LOCAL CLOCK",
    now,
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Sun report · ${location.name || location.grid || "DE"}`}
      tone={tone}
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="sun-report"
      pinElement={<SunReport open onClose={onClose} />}
    >
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>Sun times · {isDaylight ? "day" : "night"}</h4>
          <dl className="hcr-kv">
            <dt>SUNRISE</dt>
            <dd>{bothClocks(curve.rise, zone)}</dd>
            <dt>SOLAR NOON</dt>
            <dd>{bothClocks(curve.noon, zone)}</dd>
            <dt>SUNSET</dt>
            <dd>{bothClocks(curve.set, zone)}</dd>
            <dt>DAY LENGTH</dt>
            <dd>
              {curve.dayLengthMin === null
                ? "—"
                : formatCountdown(curve.dayLengthMin)}{" "}
              ({signedMinSec(curve.dayLengthDeltaMin)})
            </dd>
          </dl>
          {(dayState.polarDay || dayState.polarNight) && (
            <p className="hcr-note">
              {dayState.polarDay ? "Sun does not set" : "Sun does not rise"} at
              this latitude today
              {dayState.nextTransition
                ? `; next transition ${dayState.nextTransition.toISOString().slice(0, 10)}.`
                : "."}
            </p>
          )}
          <p className="hcr-note">
            {`Grey-line window ${
              nextEvent
                ? `around ${formatClock(nextEvent.at, zone)}`
                : "not resolved today"
            }.`}
          </p>
          <button
            type="button"
            className="hcr-link-button"
            onClick={() => setGreylineOpen(true)}
          >
            SEE GREY LINE
          </button>
        </div>
        <div className="hcr-box">
          <h4>Twilight (UTC)</h4>
          <dl className="hcr-kv">
            <dt>{TWILIGHT_LABEL.civil.toUpperCase()}</dt>
            <dd>{civil ? twilightRange(civil) : "—"}</dd>
            <dt>{TWILIGHT_LABEL.nautical.toUpperCase()}</dt>
            <dd>{nautical ? twilightRange(nautical) : "—"}</dd>
            <dt>{TWILIGHT_LABEL.astronomical.toUpperCase()}</dt>
            <dd>{astronomical ? twilightRange(astronomical) : "—"}</dd>
          </dl>
        </div>
      </div>
      <SunElevationChart curve={curve} now={now} />
      {greylineOpen && (
        <Suspense fallback={null}>
          <GreyLineReport open onClose={() => setGreylineOpen(false)} />
        </Suspense>
      )}
    </WallReport>
  );
}
