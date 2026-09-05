import { lazy, Suspense, useMemo, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getMoonConditions } from "@/lib/utils/moon";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { formatClock } from "../tokens";

// The report is only worth its bytes once an operator opens it.
const SunMoonReport = lazy(() =>
  import("../reports/SunMoonReport").then((m) => ({ default: m.SunMoonReport })),
);

/** Illumination changes by a fraction of a percent per minute. */
const TICK_MS = 60_000;

const R = 22;
const C = 26;

/**
 * The lit face of the moon: the always-lit limb as a semicircle, closed by the
 * terminator ellipse whose half-width is |cos(2π·phase)|. Phase runs 0 (new)
 * through 0.5 (full) to 1 (new again), waxing for the first half.
 */
export function MoonGlyph({ phase }: { phase: number }) {
  const k = Math.cos(2 * Math.PI * phase);
  const waxing = phase < 0.5;
  const limbSweep = waxing ? 1 : 0;
  const terminatorSweep = waxing === (k > 0) ? 0 : 1;
  const lit = `M ${C},${C - R} A ${R},${R} 0 0,${limbSweep} ${C},${C + R} A ${(
    Math.abs(k) * R
  ).toFixed(2)},${R} 0 0,${terminatorSweep} ${C},${C - R} Z`;

  return (
    <svg className="hc-media-icon" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx={C} cy={C} r={R} fill="var(--hc-fg)" opacity={0.13} />
      <path d={lit} fill="var(--hc-fg)" opacity={0.88} />
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke="var(--hc-line)"
        strokeWidth={1}
      />
    </svg>
  );
}

/** Phase, illumination and today's moonrise for EME and low-band operators. */
export function MoonTile() {
  const location = useActiveLocation();
  const now = useUTCClock(TICK_MS);
  const [reportOpen, setReportOpen] = useState(false);

  // getMoonConditions deliberately skips the forward phase-event search that
  // getMoonSnapshot performs, which is what makes it safe on a ticking tile.
  // The QTH zone goes in so rise/set belong to the operator's calendar day,
  // exactly as HamClockMoonPanel does it.
  const moon = useMemo(
    () =>
      location
        ? getMoonConditions(
            now,
            location.lat,
            location.lon,
            location.timezone,
          )
        : null,
    [location, now],
  );

  if (!moon) {
    return (
      <HamClockTile title="Moon" source="DE">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>Set your QTH to see moon rise and set</span>
        </TileSub>
      </HamClockTile>
    );
  }

  const up = moon.altitude > 0;

  return (
    <>
      <HamClockTile
        title="Moon"
        source="DE"
        state={up ? "var(--hc-info)" : "var(--hc-dim2)"}
        onOpen={() => setReportOpen(true)}
        openLabel={`Moon ${Math.round(
          moon.illumination * 100,
        )} percent, ${moon.phaseName}. Open the sun and moon report`}
      >
        <div className="hc-media">
          <MoonGlyph phase={moon.phase} />
          <div>
            <TileHero tone={up ? "hc-info-text" : "hc-dim-text"}>
              {Math.round(moon.illumination * 100)}%
            </TileHero>
            {/* One context line, so the tile stays a glance rather than a table:
                altitude while the moon is workable, the next rise while it is
                not. */}
            <TileSub>
              <span>{moon.phaseName.toUpperCase()}</span>
              {up ? (
                <span>
                  UP <b>{Math.round(moon.altitude)}°</b>
                </span>
              ) : (
                <span>
                  RISE <b>{formatClock(moon.rise, location?.timezone)}</b>
                </span>
              )}
            </TileSub>
          </div>
        </div>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <SunMoonReport
            open
            onClose={() => setReportOpen(false)}
            focus="moon"
          />
        </Suspense>
      )}
    </>
  );
}
