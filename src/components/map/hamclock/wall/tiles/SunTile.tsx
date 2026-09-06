import { lazy, Suspense, useMemo, useState } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getNextSunEvent } from "@/lib/hamclock/sunCurve";
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
    return { rise, set, next };
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

  if (!sun.next) {
    return (
      <HamClockTile title="Sunrise / sunset" source="DE">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>No sunrise or sunset at this latitude today</span>
        </TileSub>
      </HamClockTile>
    );
  }

  const minutes = (sun.next.at.getTime() - now.getTime()) / 60_000;
  const title = sun.next.type === "sunrise" ? "Sunrise" : "Sunset";
  // The source line says LOCAL, so the clocks have to be the QTH's local time
  // and not the browser's — those differ whenever you operate away from home.
  const zone = location?.timezone;

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
