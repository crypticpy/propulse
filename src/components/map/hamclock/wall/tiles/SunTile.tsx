import { lazy, Suspense, useMemo, useState } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { formatClock, formatCountdown } from "../tokens";

// The report is only worth its bytes once an operator opens it.
const SunMoonReport = lazy(() =>
  import("../reports/SunMoonReport").then((m) => ({ default: m.SunMoonReport })),
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
    const tomorrow = SunCalc.getTimes(
      new Date(now.getTime() + 86_400_000),
      location.lat,
      location.lon,
    );
    const rise = valid(today.sunrise);
    const set = valid(today.sunset);
    const upcoming = (
      [
        { type: "sunrise" as const, at: rise },
        { type: "sunset" as const, at: set },
        { type: "sunrise" as const, at: valid(tomorrow.sunrise) },
        { type: "sunset" as const, at: valid(tomorrow.sunset) },
      ].filter((event) => event.at && event.at.getTime() > now.getTime()) as {
        type: "sunrise" | "sunset";
        at: Date;
      }[]
    ).sort((a, b) => a.at.getTime() - b.at.getTime());
    return { rise, set, next: upcoming[0] ?? null };
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

  return (
    <>
      <HamClockTile
        title={title}
        source="DE · LOCAL"
        state="var(--hc-accent)"
        onOpen={() => setReportOpen(true)}
        openLabel={`${title} in ${formatCountdown(
          minutes,
        )}. Open the sun and moon report`}
      >
        <div className="hc-media">
          <div className="hc-sunico" aria-hidden="true" />
          <div>
            <TileHero tone="hc-accent-text">{formatCountdown(minutes)}</TileHero>
            <TileSub>
              <span>
                AT <b>{formatClock(sun.next.at)}</b>
              </span>
              <span>
                {formatClock(sun.rise)} / {formatClock(sun.set)}
              </span>
            </TileSub>
          </div>
        </div>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <SunMoonReport
            open
            onClose={() => setReportOpen(false)}
            focus="sun"
          />
        </Suspense>
      )}
    </>
  );
}
