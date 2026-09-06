import { lazy, Suspense, useMemo, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getGreylineStatus } from "@/lib/utils/greyline";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { formatCountdown } from "../tokens";

// The report is only worth its bytes once an operator opens it.
const GreyLineReport = lazy(() =>
  import("../reports/GreyLineReport").then((m) => ({
    default: m.GreyLineReport,
  })),
);

/** Sunrise and sunset move slowly; a minute of resolution is plenty. */
const TICK_MS = 60_000;

/**
 * Where the operator's QTH sits in the day: full daylight, full darkness, or
 * the twilight band that lifts the low bands. The hero is the state; the sub
 * line is the countdown to the next transition.
 */
export function GreyLineTile() {
  const location = useActiveLocation();
  const now = useUTCClock(TICK_MS);
  const [reportOpen, setReportOpen] = useState(false);

  const status = useMemo(
    () =>
      location ? getGreylineStatus(location.lat, location.lon, now) : null,
    [location, now],
  );

  if (!status) {
    return (
      <HamClockTile title="Grey line" source="DE">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>SET HOME IN SETTINGS</span>
        </TileSub>
      </HamClockTile>
    );
  }

  // Away from the terminator the next event names the current half of the day:
  // waiting for sunset means the sun is up.
  const daylight = status.nextEventType === "sunset";
  const hero = status.isActive ? "GREY LINE" : daylight ? "DAY" : "NIGHT";
  const tone = status.isActive
    ? "hc-warn"
    : daylight
      ? "hc-accent-text"
      : "hc-info-text";
  const state = status.isActive
    ? "var(--hc-warn)"
    : daylight
      ? "var(--hc-accent)"
      : "var(--hc-info)";

  const nextLabel = status.nextEventType === "sunrise" ? "SUNRISE" : "SUNSET";
  const countdown =
    status.minutesToNextEvent === null
      ? null
      : formatCountdown(status.minutesToNextEvent);

  return (
    <>
      <HamClockTile
        title="Grey line"
        source="DE"
        state={state}
        onOpen={() => setReportOpen(true)}
        openLabel={`Grey line: ${hero}. Open the grey line report`}
      >
        <TileHero tone={tone}>{hero}</TileHero>
        <TileSub>
          {countdown ? (
            <span>
              {nextLabel} IN <b>{countdown}</b>
            </span>
          ) : (
            <span>No sunrise or sunset at this latitude today</span>
          )}
          {status.isActive && <span className="hc-warn">LOW BANDS</span>}
        </TileSub>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <GreyLineReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
