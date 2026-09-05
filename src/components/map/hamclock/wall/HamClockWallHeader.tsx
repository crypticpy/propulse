import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useUserStore } from "@/stores/userStore";
import { HamClockWallControls } from "./HamClockWallControls";
import { HamClockPinnedReportHost } from "./reports/WallReport";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function localTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function utcTime(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function localDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${pad2(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function utcDate(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${pad2(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Short zone name ("CDT"), falling back to the offset when unavailable. */
function zoneLabel(date: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  if (part?.value) return part.value.toUpperCase();
  const offset = -date.getTimezoneOffset() / 60;
  return `UTC${offset >= 0 ? "+" : ""}${offset}`;
}

function coordinates(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? "E" : "W"}`;
}

/** Dual clocks, isolated so the one-second tick never re-renders the rails. */
function WallClocks() {
  const now = useUTCClock();
  return (
    <div className="hc-clocks">
      <div className="hc-clock">
        <div className="hc-clock-lbl">{zoneLabel(now)}</div>
        <div className="hc-clock-tm">{localTime(now)}</div>
        <div className="hc-clock-dt">{localDate(now)}</div>
      </div>
      <div className="hc-clock">
        <div className="hc-clock-lbl">UTC</div>
        <div className="hc-clock-tm hc-info-text hc-glow">{utcTime(now)}</div>
        <div className="hc-clock-dt">{utcDate(now)}</div>
      </div>
    </div>
  );
}

export interface HamClockWallHeaderProps {
  /** Forwarded to `HamClockWallControls`; opens the single settings dialog
   * the wall's parent owns. */
  onOpenSettings: () => void;
}

/** Callsign hero, station identity line, dual clocks and the overflow cluster.
 * There is no DE tile at wall density — this header carries it instead. */
export function HamClockWallHeader({
  onOpenSettings,
}: HamClockWallHeaderProps) {
  const station = useUserStore((s) => s.station);
  const location = useActiveLocation();
  const identity = [
    (location?.grid || station?.grid || "").toUpperCase(),
    location?.name?.toUpperCase(),
    location ? coordinates(location.lat, location.lon) : null,
  ].filter(Boolean);

  return (
    <header className="hc-hdr">
      <div className="hc-call hc-accent-text hc-glow">
        {station?.callsign?.toUpperCase() || "NO CALL"}
        <small>{identity.join(" · ") || "Station not configured"}</small>
      </div>
      <WallClocks />
      <HamClockWallControls onOpenSettings={onOpenSettings} />
      {/* Mounted once, outside the paged rails (HW-30): a pinned report keeps
          rendering here while the tile that opened it unmounts on page or
          scene changes. Renders nothing when no report is pinned. */}
      <HamClockPinnedReportHost />
    </header>
  );
}
