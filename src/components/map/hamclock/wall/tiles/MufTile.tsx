import { lazy, Suspense, useMemo, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getMUFAtLocation } from "@/lib/api/muf";
import { BAND_ORDER, BAND_RANGES } from "@/lib/data/bandRanges";
import { useMapStore } from "@/stores/mapStore";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";

// The report is only worth its bytes once an operator opens it.
const ForecastReport = lazy(() =>
  import("../reports/ForecastReport").then((m) => ({
    default: m.ForecastReport,
  })),
);

/** An hour is long enough for the diurnal curve to show a readable slope. */
const TREND_HOURS = 1;
/** Below this the change is noise, not a trend worth an arrow. */
const TREND_DEADBAND_MHZ = 0.2;

/**
 * Candidate bands for the "top band" line, lowest to highest.
 *
 * 160m is deliberately absent: this MUF is an F2 3000 km estimate, and top
 * band is governed by D-layer absorption rather than by the MUF, so naming it
 * as the highest usable band would be misleading. A MUF under 3.5 MHz
 * therefore reads "—" — no HF band is supported by this path.
 */
const TOP_BAND_ORDER = BAND_ORDER.filter((band) => band !== "160m");

/**
 * Highest amateur band whose lower edge sits at or below the MUF.
 *
 * `getMUFColor().band` is a legend bucket ("14-21 MHz (15m)"), which names the
 * colour stop rather than the band an operator can actually use, so the tile
 * resolves the band from the band plan instead.
 */
function topUsableBand(mufMHz: number): string {
  let top: string | null = null;
  for (const band of TOP_BAND_ORDER) {
    if (BAND_RANGES[band].startKHz / 1000 <= mufMHz) top = band;
  }
  return top ?? "—";
}

/**
 * Maximum usable frequency over the operator's own station.
 *
 * `useMUFData` returns the whole world grid for the globe shader; a single
 * headline only needs the point value, so this reads `getMUFAtLocation`
 * directly — the same `estimateMUF` the grid is built from, sampled at the
 * active location instead of interpolated out of the grid.
 */
export function MufTile({ title = "MUF" }: WallTileProps) {
  const location = useActiveLocation();
  const sfi = useCurrentSFI();
  const timeOffset = useMapStore((state) => state.timeOffset);
  const wallTime = useUTCClock(60_000);
  const [reportOpen, setReportOpen] = useState(false);

  const reading = useMemo(() => {
    if (!location || sfi == null) return null;
    const at = new Date(wallTime.getTime() + timeOffset * 60 * 60 * 1000);
    const muf = getMUFAtLocation(location.lat, location.lon, sfi, at);
    const before = getMUFAtLocation(
      location.lat,
      location.lon,
      sfi,
      new Date(at.getTime() - TREND_HOURS * 60 * 60 * 1000),
    );
    return { muf, delta: muf - before, band: topUsableBand(muf), sfi };
  }, [location, sfi, wallTime, timeOffset]);

  if (!reading) {
    return (
      <HamClockTile title={title}>
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {location ? "Waiting for solar flux…" : "SET HOME IN SETTINGS"}
        </p>
      </HamClockTile>
    );
  }

  const rising = reading.delta > TREND_DEADBAND_MHZ;
  const falling = reading.delta < -TREND_DEADBAND_MHZ;
  const trend = rising
    ? `▲ ${reading.delta.toFixed(1)} MHz/H`
    : falling
      ? `▼ ${Math.abs(reading.delta).toFixed(1)} MHz/H`
      : "STEADY";

  return (
    <>
      <HamClockTile
        title={title}
        source={`3000 KM · SFI ${Math.round(reading.sfi)}`}
        onOpen={() => setReportOpen(true)}
        openLabel={`MUF ${reading.muf.toFixed(
          1,
        )} megahertz. Open the propagation report`}
      >
        <TileHero tone="hc-info-text">
          {reading.muf.toFixed(1)}
          <span className="hcf-unit">MHz</span>
        </TileHero>
        <TileSub>
          <span>{trend}</span>
          <span>
            TOP BAND <b>{reading.band.toUpperCase()}</b>
          </span>
        </TileSub>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <ForecastReport
            open
            onClose={() => setReportOpen(false)}
            focus="muf"
          />
        </Suspense>
      )}
    </>
  );
}
