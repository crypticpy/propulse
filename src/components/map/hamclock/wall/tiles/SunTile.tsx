import { lazy, Suspense, useMemo, useState } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getNextSunEvent, getSunCurve } from "@/lib/hamclock/sunCurve";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { formatClock, formatCountdown } from "../tokens";

// The report is only worth its bytes once an operator opens it.
const SunReport = lazy(() =>
  import("../reports/SunReport").then((m) => ({ default: m.SunReport })),
);

/** A countdown in whole minutes only needs a minute-resolution clock. */
const TICK_MS = 60_000;

function valid(value: Date | undefined): Date | null {
  return value && !Number.isNaN(value.getTime()) ? value : null;
}

/**
 * How long until the sun next crosses the horizon here, with today's rise and
 * set for context. The tile title names the event, so the hero can stay a bare
 * duration and remain legible across the room.
 */
export function SunTile() {
  const location = useActiveLocation();
  const now = useUTCClock(TICK_MS);
  const [reportOpen, setReportOpen] = useState(false);

  const sun = useMemo(() => {
    if (!location) return null;
    const today = SunCalc.getTimes(now, location.lat, location.lon);
    const rise = valid(today.sunrise);
    const set = valid(today.sunset);
    // Shared with `SunReport.tsx` so the tile's countdown and the report's
    // hero can never name a different next event.
    const next = getNextSunEvent(location.lat, location.lon, now);
    // Only computed at the latitudes where `next` comes back null (polar day
    // or polar night): tells the no-event tile which state it is in and when
    // it ends, without paying for a 24-sample curve on every ordinary tick.
    const dayState = next
      ? null
      : getSunCurve(location.lat, location.lon, now).dayState;
    return { rise, set, next, dayState };
  }, [location, now]);

  if (!sun) {
    return (
      <HamClockTile title="Sunrise / sunset" source="DE">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>Set your QTH to see sunrise and sunset</span>
        </TileSub>
      </HamClockTile>
    );
  }

  // The source line says LOCAL, so the clocks have to be the QTH's local time
  // and not the browser's — those differ whenever you operate away from home.
  const zone = location?.timezone;

  if (!sun.next) {
    // Polar day/night: there is no next crossing to count down to, but the
    // report still has a real state (SUN DOES NOT SET/RISE, the elevation
    // curve, the next transition date) — the tile has to stay a report
    // trigger here too, or that state is unreachable from the wall (#243).
    const heroText = sun.dayState?.polarDay
      ? "NO SUNSET"
      : sun.dayState?.polarNight
        ? "NO SUNRISE"
        : "—";
    const subText = sun.dayState?.nextTransition
      ? `Next transition ${sun.dayState.nextTransition.toISOString().slice(0, 10)}`
      : "No sunrise or sunset at this latitude today";
    return (
      <>
        <HamClockTile
          title="Sunrise / sunset"
          source="DE"
          state="var(--hc-info)"
          onOpen={() => setReportOpen(true)}
          openLabel={`${heroText}. Open the sun report`}
        >
          <TileHero tone="hc-info-text">{heroText}</TileHero>
          <TileSub>
            <span>{subText}</span>
          </TileSub>
        </HamClockTile>

        {reportOpen && (
          <Suspense fallback={null}>
            <SunReport open onClose={() => setReportOpen(false)} />
          </Suspense>
        )}
      </>
    );
  }

  const minutes = (sun.next.at.getTime() - now.getTime()) / 60_000;
  const title = sun.next.type === "sunrise" ? "Sunrise" : "Sunset";

  return (
    <>
      <HamClockTile
        title={title}
        source="DE · LOCAL"
        state="var(--hc-accent)"
        onOpen={() => setReportOpen(true)}
        openLabel={`${title} in ${formatCountdown(
          minutes,
        )}. Open the sun report`}
      >
        <div className="hc-media">
          <div className="hc-sunico" aria-hidden="true" />
          <div>
            <TileHero tone="hc-accent-text">
              {formatCountdown(minutes)}
            </TileHero>
            <TileSub>
              <span>
                AT <b>{formatClock(sun.next.at, zone)}</b>
              </span>
              <span>
                {formatClock(sun.rise, zone)} / {formatClock(sun.set, zone)}
              </span>
            </TileSub>
          </div>
        </div>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <SunReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
