import { useId, useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getNextSunEvent, getSunCurve } from "@/lib/hamclock/sunCurve";
import {
  GREYLINE_WINDOW_MINUTES,
  getGreylineIntensityCurve,
  getGreylineStatus,
  getMutualGreylineWindow,
  isGreylineActiveForBand,
  type GreylineHourSample,
  type GreylineStatus,
  type MutualGreylineWindow,
} from "@/lib/utils/greyline";
import { useMapStore } from "@/stores/mapStore";
import { formatClock, formatCountdown, reportFooter } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

const TICK_MS = 60_000;

/** The three low bands the wall shows a tier for, in the order the spec's
 * fact list and chart rows list them. */
const LOW_BANDS = ["160m", "80m", "40m"] as const;

/** "07:12 / 12:12Z" — local and UTC together, per the style guide's clock
 * rule (section 6): a wall reader must never see one without the other. */
function bothClocks(value: Date | null, zone: string | undefined): string {
  if (!value) return "—";
  return `${formatClock(value, zone)} / ${formatClock(value, "UTC")}Z`;
}

/** ACTIVE/INACTIVE for one band at one intensity — the wall only shows the
 * binary `isGreylineActiveForBand` already returns; it does not invent a
 * per-band tier the model does not compute. */
function bandTierLabel(band: string, status: GreylineStatus): string {
  return isGreylineActiveForBand(band, status.intensity)
    ? "ACTIVE"
    : "INACTIVE";
}

/**
 * "approaching/active/peak/fading/inactive" (wall spec section 26.9,
 * fact column). `getGreylineStatus` only ever reaches "enhanced" or "peak"
 * through one of two mutually exclusive branches — closing in on the next
 * crossing, or just past the last one — so which branch fired is all this
 * needs to tell approaching from fading apart.
 */
function greylineStateWord(status: GreylineStatus): string {
  if (status.intensity === "none") return "INACTIVE";
  if (status.intensity === "normal") return "ACTIVE";
  const approaching =
    status.minutesToNextEvent !== null &&
    status.minutesToNextEvent <= GREYLINE_WINDOW_MINUTES;
  if (status.intensity === "peak") return "PEAK";
  return approaching ? "APPROACHING" : "FADING";
}

interface GreylineWindow {
  start: Date;
  end: Date;
}

/**
 * The +/-`GREYLINE_WINDOW_MINUTES` window around whichever terminator
 * crossing is currently governing the intensity: the upcoming one while
 * approaching, the one just passed while fading. Falls back to the next
 * crossing's window when neither is within range, so the report always has
 * a window to name even between grey-line periods.
 */
function currentOrNextWindow(
  status: GreylineStatus,
  now: Date,
): { window: GreylineWindow | null; crossing: Date | null } {
  let crossing: Date | null = null;
  if (
    status.minutesToNextEvent !== null &&
    status.minutesToNextEvent <= GREYLINE_WINDOW_MINUTES &&
    status.nextEventTime
  ) {
    crossing = status.nextEventTime;
  } else if (
    status.minutesSinceLastEvent !== null &&
    status.minutesSinceLastEvent <= GREYLINE_WINDOW_MINUTES
  ) {
    crossing = new Date(now.getTime() - status.minutesSinceLastEvent * 60_000);
  } else {
    crossing = status.nextEventTime;
  }
  if (!crossing) return { window: null, crossing: null };
  return {
    window: {
      start: new Date(crossing.getTime() - GREYLINE_WINDOW_MINUTES * 60_000),
      end: new Date(crossing.getTime() + GREYLINE_WINDOW_MINUTES * 60_000),
    },
    crossing,
  };
}

/**
 * 24 h grey-line intensity, the current window and (when a DX target is set)
 * the mutual overlap window highlighted, with the three low-band tiers drawn
 * as stacked step rows underneath — this report's own chart, in the same
 * visual language as `SunElevationChart` (300x118 viewBox, `--hc-*` tokens,
 * mono captions), since neither `SolarMiniChart` nor `SolarSeriesChart` can
 * paint a highlighted band or a tier-step row.
 */
function GreylineIntensityChart({
  curve,
  now,
  ownWindow,
  mutualWindow,
  status,
}: {
  curve: GreylineHourSample[];
  now: Date;
  ownWindow: GreylineWindow | null;
  mutualWindow: MutualGreylineWindow | null;
  status: GreylineStatus;
}) {
  const id = useId();
  const width = 300;
  const left = 30;
  const right = 8;
  const chartTop = 8;
  const chartBottom = 58;
  const bandRowHeight = 10;
  const bandsTop = chartBottom + 8;
  const bandsBottom = bandsTop + LOW_BANDS.length * bandRowHeight;
  const height = bandsBottom + 14;

  const dayStart = curve[0].at.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const clampX = (t: number) => Math.min(dayEnd, Math.max(dayStart, t));

  const x = (t: number) =>
    left + ((t - dayStart) / (dayEnd - dayStart)) * (width - left - right);
  const y = (value: number) => chartBottom - value * (chartBottom - chartTop);

  const path = curve
    .map(
      (sample, i) =>
        `${i === 0 ? "M" : "L"}${x(sample.at.getTime()).toFixed(1)},${y(sample.intensity).toFixed(1)}`,
    )
    .join(" ");
  const area = `${path} L${x(curve[curve.length - 1].at.getTime()).toFixed(1)},${chartBottom} L${x(curve[0].at.getTime()).toFixed(1)},${chartBottom} Z`;

  const windowRect = (
    window: GreylineWindow | null,
    fill: string,
    key: string,
  ) => {
    if (!window) return null;
    const rectX = x(clampX(window.start.getTime()));
    const rectEnd = x(clampX(window.end.getTime()));
    if (rectEnd <= rectX) return null;
    return (
      <rect
        key={key}
        x={rectX}
        y={chartTop}
        width={rectEnd - rectX}
        height={bandsBottom - chartTop}
        fill={fill}
      />
    );
  };

  return (
    <figure className="mt-4 min-w-0 border-t border-white/10 pt-3">
      <figcaption className="mb-1 text-xs text-slate-300">
        GREY-LINE INTENSITY — 24 H · COMPUTED AT QTH
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>
          Grey-line intensity over 24 hours UTC, with the current window and the
          160, 80 and 40 metre tiers marked.
        </title>
        {windowRect(mutualWindow, "rgb(var(--hc-accent-rgb) / 0.22)", "mutual")}
        {windowRect(ownWindow, "rgb(var(--hc-warn-rgb) / 0.22)", "own")}
        <line
          x1={left}
          x2={width - right}
          y1={chartBottom}
          y2={chartBottom}
          stroke="var(--hcr-chart-axis, #94a3b8)"
          strokeDasharray="4 4"
        />
        <path d={area} fill="rgb(var(--hc-warn-rgb) / 0.14)" stroke="none" />
        <path
          d={path}
          fill="none"
          stroke="var(--hcr-chart-observed, #44ddff)"
          strokeWidth="2"
        />
        {LOW_BANDS.map((band, row) => {
          const rowY = bandsTop + row * bandRowHeight;
          return (
            <g key={band}>
              <text
                x={left - 4}
                y={rowY + bandRowHeight * 0.7}
                textAnchor="end"
                fill="var(--hcr-chart-dim, #cbd5e1)"
                fontSize="8"
              >
                {band}
              </text>
              {curve.map((sample, i) => {
                const next = curve[i + 1]?.at.getTime() ?? dayEnd;
                const active = isGreylineActiveForBand(band, sample.level);
                return (
                  <rect
                    key={sample.hour}
                    x={x(sample.at.getTime())}
                    y={rowY}
                    width={Math.max(0, x(next) - x(sample.at.getTime()))}
                    height={bandRowHeight - 2}
                    fill={
                      active
                        ? "var(--hc-warn)"
                        : "var(--hcr-chart-dim, #cbd5e1)"
                    }
                    opacity={active ? 0.85 : 0.15}
                  />
                );
              })}
            </g>
          );
        })}
        {curve.map((sample, i) => {
          const next = curve[i + 1]?.at.getTime() ?? dayEnd;
          return (
            <rect
              key={`hit-${sample.hour}`}
              x={x(sample.at.getTime())}
              y={chartTop}
              width={Math.max(0, x(next) - x(sample.at.getTime()))}
              height={bandsBottom - chartTop}
              fill="transparent"
            >
              <title>
                {formatClock(sample.at, "UTC")}Z — intensity{" "}
                {sample.intensity.toFixed(2)}, low bands{" "}
                {isGreylineActiveForBand("40m", sample.level)
                  ? "ACTIVE"
                  : "INACTIVE"}
              </title>
            </rect>
          );
        })}
        {now.getTime() >= dayStart && now.getTime() <= dayEnd && (
          <line
            x1={x(now.getTime())}
            x2={x(now.getTime())}
            y1={chartTop}
            y2={bandsBottom}
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
        <caption>Grey-line intensity and low-band tiers by UTC hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour (UTC)</th>
            <th scope="col">Intensity</th>
            <th scope="col">160m</th>
            <th scope="col">80m</th>
            <th scope="col">40m</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((sample) => (
            <tr key={sample.hour}>
              <td>{String(sample.hour).padStart(2, "0")}Z</td>
              <td>{sample.intensity.toFixed(2)}</td>
              {LOW_BANDS.map((band) => (
                <td key={band}>
                  {isGreylineActiveForBand(band, sample.level)
                    ? "Active"
                    : "Inactive"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hcr-note">
        {`Current window shaded amber${
          mutualWindow
            ? "; mutual overlap with the DX target shaded orange."
            : "."
        } Status: ${greylineStateWord(status)}.`}
      </p>
    </figure>
  );
}

export interface GreyLineReportProps {
  open: boolean;
  onClose: () => void;
  /** Closes every dialog stacked above the map instead of just this one.
   * SunReport passes this when it nests GreyLineReport behind "SEE GREY
   * LINE", so SHOW TERMINATOR reveals the map rather than the Sun report.
   * Defaults to `onClose` when this report is the top-level dialog. */
  onCloseAll?: () => void;
}

/**
 * The grey line's own report behind the grey-line tile (wall spec section
 * 26.9): the current window, state and countdown, the 160/80/40 m tiers,
 * the mutual overlap window with the DX target and the 24 h intensity chart.
 */
export function GreyLineReport({
  open,
  onClose,
  onCloseAll,
}: GreyLineReportProps) {
  const location = useActiveLocation();
  const target = useMapStore((s) => s.target);
  const terminatorEnabled = useMapStore((s) => s.layers.terminator);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const now = useUTCClock(TICK_MS);
  // SHOW TERMINATOR closes every dialog stacked above the map, not just this
  // one -- when this report was opened via SunReport's "SEE GREY LINE" link,
  // `onClose` alone would only close this dialog and reveal the Sun report.
  const closeToMap = onCloseAll ?? onClose;

  const status = useMemo(
    () =>
      location ? getGreylineStatus(location.lat, location.lon, now) : null,
    [location, now],
  );
  const intensityCurve = useMemo(
    () =>
      location
        ? getGreylineIntensityCurve(location.lat, location.lon, now)
        : null,
    [location, now],
  );
  const { window: ownWindow, crossing } = useMemo(
    () =>
      status
        ? currentOrNextWindow(status, now)
        : { window: null, crossing: null },
    [status, now],
  );
  const nextWindowEvent = useMemo(
    () =>
      location && crossing
        ? getNextSunEvent(location.lat, location.lon, crossing)
        : null,
    [location, crossing],
  );
  const mutualWindow = useMemo(
    () =>
      location && target
        ? getMutualGreylineWindow(
            location.lat,
            location.lon,
            target.lat,
            target.lon,
            now,
          )
        : null,
    [location, target, now],
  );
  // `getGreylineStatus` deliberately folds in yesterday's and tomorrow's
  // events so the intensity curve stays continuous across midnight; that
  // means its `nextEventTime`/`lastEventType` can both be non-null from an
  // adjacent day even when today itself has no sunrise or sunset at all (the
  // first or last day of a polar season). Whether there is a crossing today
  // has to come from today's own sun times, not from that aggregate.
  const sunCurveToday = useMemo(
    () => (location ? getSunCurve(location.lat, location.lon, now) : null),
    [location, now],
  );

  if (!location || !status || !intensityCurve || !sunCurveToday) {
    const idle = reportFooter("GREYLINE.TS · DE", null);
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Grey line report"
        hero="—"
        verdict="NO QTH"
        footer={idle.footer}
        updated={idle.updated}
      >
        <p className="hcr-note">
          Set your operating location to see the grey-line window and the
          low-band tiers from your own horizon.
        </p>
      </WallReport>
    );
  }

  const zone = location.timezone;
  const isNoWindowToday =
    sunCurveToday.rise === null && sunCurveToday.set === null;
  // Once today itself has no crossing, none of the aggregated window/tier
  // fields below may be shown as if they were today's -- they can still hold
  // an adjacent day's values.
  const ownWindowForDisplay = isNoWindowToday ? null : ownWindow;
  const nextWindowValue = isNoWindowToday
    ? sunCurveToday.dayState.nextTransition
      ? sunCurveToday.dayState.nextTransition.toISOString().slice(0, 10)
      : "—"
    : nextWindowEvent
      ? bothClocks(nextWindowEvent.at, zone)
      : "—";
  const bandLabel = (band: string) =>
    isNoWindowToday ? "INACTIVE" : bandTierLabel(band, status);
  const tone: "warn" | "accent" | "info" =
    status.intensity === "peak" || status.intensity === "enhanced"
      ? "warn"
      : status.intensity === "normal"
        ? "accent"
        : "info";
  const stateWord = greylineStateWord(status);
  const timeLeftMin = ownWindowForDisplay
    ? now.getTime() < ownWindowForDisplay.end.getTime() &&
      now.getTime() >= ownWindowForDisplay.start.getTime()
      ? (ownWindowForDisplay.end.getTime() - now.getTime()) / 60_000
      : (ownWindowForDisplay.start.getTime() - now.getTime()) / 60_000
    : null;

  const hero = isNoWindowToday
    ? "—"
    : timeLeftMin === null
      ? "—"
      : formatCountdown(Math.max(0, timeLeftMin));
  const verdict = isNoWindowToday ? "NO GREY LINE TODAY" : stateWord;

  const targetOverlapValue = !target
    ? "NO TARGET SET"
    : !mutualWindow
      ? "NONE TODAY"
      : mutualWindow.active
        ? "YES · ACTIVE NOW"
        : `YES · IN ${formatCountdown((mutualWindow.start.getTime() - now.getTime()) / 60_000)}`;

  const facts: WallReportFact[] = [
    {
      label: "WINDOW START",
      value: ownWindowForDisplay
        ? bothClocks(ownWindowForDisplay.start, zone)
        : "—",
    },
    {
      label: "WINDOW END",
      value: ownWindowForDisplay
        ? bothClocks(ownWindowForDisplay.end, zone)
        : "—",
    },
    { label: "STATE", value: verdict },
    { label: "TIME LEFT", value: hero },
    { label: "160M", value: bandLabel("160m") },
    { label: "80M", value: bandLabel("80m") },
    { label: "40M", value: bandLabel("40m") },
    { label: "TARGET OVERLAP", value: targetOverlapValue },
    { label: "NEXT WINDOW", value: nextWindowValue },
  ];

  const { footer, updated } = reportFooter(
    "GREYLINE.TS AT THE ACTIVE QTH · LOCAL CLOCK",
    now,
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Grey line report · ${location.name || location.grid || "DE"}`}
      tone={tone}
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="greyline-report"
      pinElement={<GreyLineReport open onClose={onClose} />}
    >
      {isNoWindowToday && (
        <p className="hcr-note">
          No grey-line crossing at this latitude today
          {sunCurveToday.dayState.nextTransition
            ? `; the next one is ${sunCurveToday.dayState.nextTransition.toISOString().slice(0, 10)}.`
            : "."}
        </p>
      )}
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>
            Window ·{" "}
            {isNoWindowToday ? "no crossing today" : stateWord.toLowerCase()}
          </h4>
          <dl className="hcr-kv">
            <dt>START</dt>
            <dd>
              {ownWindowForDisplay
                ? bothClocks(ownWindowForDisplay.start, zone)
                : "—"}
            </dd>
            <dt>END</dt>
            <dd>
              {ownWindowForDisplay
                ? bothClocks(ownWindowForDisplay.end, zone)
                : "—"}
            </dd>
            <dt>NEXT WINDOW</dt>
            <dd>{nextWindowValue}</dd>
          </dl>
        </div>
        <div className="hcr-box">
          <h4>Low bands</h4>
          <dl className="hcr-kv">
            <dt>160M</dt>
            <dd>{bandLabel("160m")}</dd>
            <dt>80M</dt>
            <dd>{bandLabel("80m")}</dd>
            <dt>40M</dt>
            <dd>{bandLabel("40m")}</dd>
          </dl>
          <p className="hcr-note">
            {target
              ? `Mutual overlap with the DX target: ${targetOverlapValue.toLowerCase()}.`
              : "Pick a DX target on the map to see the mutual grey-line overlap window."}
          </p>
          <button
            type="button"
            className="hcr-link-button"
            onClick={() => {
              if (!terminatorEnabled) toggleLayer("terminator");
              closeToMap();
            }}
          >
            SHOW TERMINATOR
          </button>
        </div>
      </div>
      <GreylineIntensityChart
        curve={intensityCurve}
        now={now}
        ownWindow={ownWindowForDisplay}
        mutualWindow={mutualWindow}
        status={status}
      />
    </WallReport>
  );
}
