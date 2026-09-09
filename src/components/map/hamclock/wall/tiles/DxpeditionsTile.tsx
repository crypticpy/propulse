import { lazy, Suspense, useMemo, useState } from "react";
import { useDxpeditions } from "@/hooks/useDxpeditions";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  getSchedulePhase,
  scheduleCountdown,
} from "@/lib/hamclock/schedule";
import {
  activeCount,
  scheduledDxpeditions,
} from "@/lib/hamclock/wallCalendar";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { useVisibleRows } from "../useVisibleRows";

const DxpeditionsReport = lazy(() =>
  import("../reports/DxpeditionsReport").then((m) => ({
    default: m.DxpeditionsReport,
  })),
);

/** Optional wall tile: active and upcoming NG3K ADXO operations. */
export function DxpeditionsTile() {
  const { entries, status, isLoading, error } = useDxpeditions();
  const now = useUTCClock();
  const rows = useMemo(
    () => scheduledDxpeditions(entries, now),
    [entries, now],
  );
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);
  const [reportOpen, setReportOpen] = useState(false);
  const live = activeCount(rows, now);
  const unavailable = error != null || status !== "ok";

  if (isLoading) {
    return (
      <HamClockTile title="DXpeditions" source="NG3K ADXO">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hc-placeholder">LOADING OPERATIONS</p>
      </HamClockTile>
    );
  }

  if (unavailable) {
    return (
      <HamClockTile
        title="DXpeditions"
        source="NG3K ADXO"
        state="var(--hc-warn)"
      >
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hc-placeholder">DXPEDITION SCHEDULE UNAVAILABLE</p>
      </HamClockTile>
    );
  }

  const verdict = live > 0 ? "ON AIR" : rows.length > 0 ? "NEXT" : "NONE";
  const next = rows[0];

  return (
    <>
      <HamClockTile
        title="DXpeditions"
        source="NG3K ADXO"
        grow
        state={live > 0 ? "var(--hc-good)" : undefined}
        onOpen={() => setReportOpen(true)}
        openLabel={`DXpeditions: ${live} on air of ${rows.length}. Open the DXpeditions report`}
      >
        <div className="hc-heroline">
          <TileHero tone={live > 0 ? "hc-good" : "hc-dim-text"} flush>
            {String(live)}
          </TileHero>
          <div
            className={`hc-verdict${live > 0 ? " hc-glow hc-good" : ""}`}
          >
            {verdict}
          </div>
        </div>
        <TileSub>
          <span>
            {next
              ? scheduleCountdown(next.window, now).toUpperCase()
              : "NO ANNOUNCED OPERATIONS"}
          </span>
        </TileSub>
        <div className="hc-rows" ref={ref}>
          {rows.slice(0, visible).map(({ entry, window }) => {
            const active = getSchedulePhase(window, now) === "active";
            return (
              <div
                className="hc-row"
                key={`${entry.callsign}:${entry.startDate}`}
              >
                <span
                  className={`hc-chip${active ? " hc-chip--now" : " hc-chip--next"}`}
                >
                  {active ? "NOW" : "NEXT"}
                </span>
                <span className="hc-row-call">
                  {entry.callsign}
                  <small>{entry.entity}</small>
                </span>
                <span
                  className={`hc-row-age${active ? " hc-row-age--new" : ""}`}
                >
                  {scheduleCountdown(window, now)}
                </span>
              </div>
            );
          })}
        </div>
      </HamClockTile>
      {reportOpen && (
        <Suspense fallback={null}>
          <DxpeditionsReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
