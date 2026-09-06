import { lazy, Suspense, useMemo, useState } from "react";
import { useSolarResource } from "@/hooks/useSolarResource";
import type { XrayPoint } from "@/lib/solar/dataTypes";
import { latestByTime, xrayClass } from "@/lib/solar/selectors";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { xrayTone } from "../tokens";

// The report is only worth its bytes once an operator opens it.
const XrayReport = lazy(() =>
  import("../reports/XrayReport").then((m) => ({ default: m.XrayReport })),
);

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Marker position on the A–B–C–M–X bar. Each letter is one decade of flux and
 * one fifth of the bar, so the marker is a plain log10 mapping of A0 → X10.
 */
function xrayScalePercent(flux: number): number {
  if (!(flux > 0)) return 0;
  const decades = (Math.log10(flux) + 8) / 5;
  return Math.min(100, Math.max(0, decades * 100));
}

/** GOES long-wavelength X-ray flux: the current class plus the six-hour peak. */
export function XrayTile() {
  const query = useSolarResource<XrayPoint[]>("noaa-xray");
  const [reportOpen, setReportOpen] = useState(false);
  const points = query.data?.envelope.data;

  const summary = useMemo(() => {
    const current = latestByTime(points, (point) => point.time_tag);
    if (!current) return null;
    const currentAt = Date.parse(current.time_tag);
    let peak = current;
    for (const point of points ?? []) {
      const at = Date.parse(point.time_tag);
      if (!Number.isFinite(at) || currentAt - at > SIX_HOURS_MS) continue;
      if (point.flux > peak.flux) peak = point;
    }
    return { current, peak };
  }, [points]);

  if (!summary) {
    return (
      <HamClockTile title="X-ray flux" source="GOES">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>
            {query.isError
              ? "GOES X-ray feed unavailable"
              : "Waiting for the GOES X-ray feed…"}
          </span>
        </TileSub>
      </HamClockTile>
    );
  }

  const { current, peak } = summary;
  const label = xrayClass(current.flux) ?? "—";
  const { tone, state } = xrayTone(label.charAt(0));
  const peakLabel = xrayClass(peak.flux) ?? "—";
  const peakAt = peak.time_tag.slice(11, 16);
  const satellite = current.satellite ? `GOES-${current.satellite}` : "GOES";

  return (
    <>
      <HamClockTile
        title="X-ray flux"
        source={satellite}
        state={state}
        onOpen={() => setReportOpen(true)}
        openLabel={`X-ray flux ${label}. Open the solar report`}
      >
        <TileHero tone={tone}>{label}</TileHero>
        <div className="hc-gbar">
          <i style={{ left: `${xrayScalePercent(current.flux)}%` }} />
        </div>
        <div className="hc-ticks" aria-hidden="true">
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>M</span>
          <span>X</span>
        </div>
        <TileSub>
          <span>
            6H MAX <b>{peakLabel}</b> {peakAt}Z
          </span>
        </TileSub>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <XrayReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
