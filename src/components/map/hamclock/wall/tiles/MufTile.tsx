import { lazy, Suspense, useMemo, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useUTCClock } from "@/hooks/useUTCClock";
import { getMUFAtLocation, getMUFColor } from "@/lib/api/muf";
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
    return { muf, delta: muf - before, band: getMUFColor(muf).band, sfi };
  }, [location, sfi, wallTime, timeOffset]);

  if (!reading) {
    return (
      <HamClockTile title={title}>
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">
          {location
            ? "Waiting for solar flux…"
            : "Set an operating location to read your MUF."}
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
