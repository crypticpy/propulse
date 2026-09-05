import { useMemo } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getGreylineStatus } from "@/lib/utils/greyline";
import { getMoonConditions } from "@/lib/utils/moon";
import { MoonGlyph } from "../tiles/MoonTile";
import { formatClock, formatCountdown, reportFooter } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";
import { SolarMiniChart } from "@/components/solar/SolarMiniChart";

/** Which tile opened the report; it only chooses the hero. */
export type SunMoonFocus = "sun" | "greyline" | "moon";

/** Minutes either side of a horizon crossing that the low bands lift. */
const GREYLINE_WINDOW_MIN = 30;

const TICK_MS = 60_000;

function valid(value: Date | undefined): Date | null {
  return value && !Number.isNaN(value.getTime()) ? value : null;
}

/** "9h 12m" — the span between two horizon crossings, or `—`. */
function spanLabel(from: Date | null, to: Date | null): string {
  if (!from || !to) return "—";
  const minutes = (to.getTime() - from.getTime()) / 60_000;
  return minutes > 0 ? formatCountdown(minutes) : "—";
}

export interface SunMoonReportProps {
  open: boolean;
  onClose: () => void;
  focus: SunMoonFocus;
}

/**
 * Sun, grey line and moon in one report, because an operator chasing the
 * terminator wants all three at once. Every value is computed from the active
 * QTH with the same SunCalc helpers the tiles use, so nothing here can
 * disagree with the rail behind it.
 */
export function SunMoonReport({ open, onClose, focus }: SunMoonReportProps) {
  const location = useActiveLocation();
  const now = useUTCClock(TICK_MS);

  const sun = useMemo(() => {
    if (!location) return null;
    const today = SunCalc.getTimes(now, location.lat, location.lon);
    return {
      rise: valid(today.sunrise),
      set: valid(today.sunset),
      noon: valid(today.solarNoon),
    };
  }, [location, now]);

  const greyline = useMemo(
    () =>
      location ? getGreylineStatus(location.lat, location.lon, now) : null,
    [location, now],
  );

  const moon = useMemo(
    () =>
      location
        ? getMoonConditions(now, location.lat, location.lon, location.timezone)
        : null,
    [location, now],
  );

  if (!location || !sun || !greyline || !moon) {
    const idle = reportFooter("SUNCALC · DE", null);
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Sun & moon report"
        hero="—"
        verdict="NO QTH"
        footer={idle.footer}
        updated={idle.updated}
      >
        <p className="hcr-note">
          Set your operating location to see sunrise, sunset, the grey-line
          window and the moon from your own horizon.
        </p>
      </WallReport>
    );
  }

  const daylight = greyline.nextEventType === "sunset";
  const state = greyline.isActive ? "GREY LINE" : daylight ? "DAY" : "NIGHT";
  const stateTone = greyline.isActive
    ? "hc-warn"
    : daylight
      ? "hc-accent-text"
      : "hc-info-text";

  const countdown =
    greyline.minutesToNextEvent === null
      ? "—"
      : formatCountdown(greyline.minutesToNextEvent);
  const nextWord =
    greyline.nextEventType === "sunrise" ? "TO SUNRISE" : "TO SUNSET";

  const greyWindow =
    greyline.nextEventTime === null
      ? "—"
      : `${formatClock(
          new Date(
            greyline.nextEventTime.getTime() - GREYLINE_WINDOW_MIN * 60_000,
          ),
          location.timezone,
        )}–${formatClock(
          new Date(
            greyline.nextEventTime.getTime() + GREYLINE_WINDOW_MIN * 60_000,
          ),
          location.timezone,
        )}`;

  const moonUp = moon.altitude > 0;
  const hero =
    focus === "moon" ? `${Math.round(moon.illumination * 100)}%` : countdown;
  const verdict = focus === "moon" ? moon.phaseName.toUpperCase() : state;
  const tone =
    focus === "moon" ? (moonUp ? "hc-info-text" : "hc-dim-text") : stateTone;

  const facts: WallReportFact[] = [
    { label: "SUNRISE", value: formatClock(sun.rise, location.timezone) },
    { label: "SUNSET", value: formatClock(sun.set, location.timezone) },
    { label: "DAY LENGTH", value: spanLabel(sun.rise, sun.set) },
    { label: "GREY LINE", value: greyWindow },
    { label: "MOON", value: moon.phaseName.toUpperCase() },
    { label: "ILLUM", value: `${Math.round(moon.illumination * 100)}%` },
    { label: "MOONRISE", value: formatClock(moon.rise, location.timezone) },
    { label: "MOONSET", value: formatClock(moon.set, location.timezone) },
    { label: "NEXT EVENT", value: `${nextWord} ${countdown}` },
  ];

  // SunCalc is instantaneous, not a polled feed — "now" is always the
  // freshest read, so the footer's age is honestly "just now" rather than
  // undefined. Trend chart: real SunCalc output swept across a two-week
  // window centred on today, not a sampled/faked series.
  const { footer, updated } = reportFooter(
    "SUNCALC AT THE ACTIVE QTH · LOCAL CLOCK",
    now,
  );
  const DAY_MS = 24 * 60 * 60 * 1000;
  const trendPoints = Array.from({ length: 15 }, (_, i) => {
    const at = new Date(now.getTime() + (i - 7) * DAY_MS);
    const value =
      focus === "moon"
        ? SunCalc.getMoonIllumination(at).fraction * 100
        : (() => {
            const times = SunCalc.getTimes(at, location.lat, location.lon);
            const rise = valid(times.sunrise);
            const set = valid(times.sunset);
            return rise && set
              ? (set.getTime() - rise.getTime()) / (60 * 60 * 1000)
              : NaN;
          })();
    return { timestamp: at.toISOString(), value };
  }).filter((point) => Number.isFinite(point.value));

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Sun & moon report · ${location.name || location.grid || "DE"}`}
      tone={
        tone === "hc-warn"
          ? "warn"
          : tone === "hc-accent-text"
            ? "accent"
            : "info"
      }
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId={`sunmoon-${focus}`}
      pinElement={<SunMoonReport open onClose={onClose} focus={focus} />}
    >
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>Sun · {state}</h4>
          <dl className="hcr-kv">
            <dt>SUNRISE</dt>
            <dd>{formatClock(sun.rise, location.timezone)}</dd>
            <dt>SOLAR NOON</dt>
            <dd>{formatClock(sun.noon, location.timezone)}</dd>
            <dt>SUNSET</dt>
            <dd>{formatClock(sun.set, location.timezone)}</dd>
            <dt>DAY LENGTH</dt>
            <dd>{spanLabel(sun.rise, sun.set)}</dd>
          </dl>
          <p className="hcr-note">
            {greyline.isActive
              ? "Grey line now — 160m through 40m open along the terminator."
              : `Grey-line window ${greyWindow}.`}
          </p>
        </div>
        <div className="hcr-box">
          <h4>Moon · {moonUp ? "workable" : "below horizon"}</h4>
          <div className="hcr-media">
            <MoonGlyph phase={moon.phase} />
            <dl className="hcr-kv">
              <dt>ILLUMINATED</dt>
              <dd>{Math.round(moon.illumination * 100)}%</dd>
              <dt>ALTITUDE</dt>
              <dd>{Math.round(moon.altitude)}°</dd>
              <dt>AZIMUTH</dt>
              <dd>{Math.round(moon.azimuth)}°</dd>
              <dt>RISE / SET</dt>
              <dd>
                {formatClock(moon.rise, location.timezone)} /{" "}
                {formatClock(moon.set, location.timezone)}
              </dd>
            </dl>
          </div>
        </div>
      </div>
      <div className="hcr-chart">
        <SolarMiniChart
          label={
            focus === "moon"
              ? "MOON ILLUM — 15 D · SUNCALC"
              : "DAY LENGTH — 15 D · SUNCALC"
          }
          points={trendPoints}
          unit={focus === "moon" ? "%" : "h"}
          maxGapMs={2 * DAY_MS}
        />
      </div>
    </WallReport>
  );
}
