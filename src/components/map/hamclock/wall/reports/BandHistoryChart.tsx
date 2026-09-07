import { useMemo, useRef, useState } from "react";
import {
  bandHistoryHours,
  type BandHistorySnapshot,
} from "@/lib/hamclock/bandHistory";
import { getBandColor } from "@/lib/utils/spotColors";
import { liveBandSlots, type LiveBandSample } from "@/lib/hamclock/liveBandHistory";
import { HamClockButton } from "../controls";
import { useElementSize } from "../useElementSize";

/** Separate completed-hour raw counts from the live partial-window counters. */
export function BandHistoryChart({
  snapshot,
  live,
}: {
  snapshot?: BandHistorySnapshot;
  live: { samples: LiveBandSample[]; now: number };
}) {
  const [showLive, setShowLive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || 800;
  const height = measured.height || 220;
  const hours = useMemo(() => showLive
    ? liveBandSlots(live.samples, live.now).map(({ slot, sample, future }) => ({
      hour: new Date(sample?.at ?? slot).toISOString(),
      rows: Object.entries(sample?.counts ?? {}).map(([band, count]) => ({ band, count, sources: {} as Record<string, number> })),
      count: sample ? Object.values(sample.counts).reduce((a, b) => a + b, 0) : null,
      future,
    }))
    : bandHistoryHours(snapshot ?? {
      rows: [], scope: "global", fetchedAt: "",
      windowStart: new Date(Math.floor(live.now / 3_600_000) * 3_600_000 - 6 * 3_600_000).toISOString(),
      windowEnd: new Date(Math.floor(live.now / 3_600_000) * 3_600_000).toISOString(),
    }).map((hour) => ({ ...hour, future: false })), [snapshot, showLive, live.samples, live.now]);
  const known = hours.flatMap((hour) => hour.count === null ? [] : [hour.count]);
  // Every supported band must be recorded before an hour's total is known.
  const complete = hours.every((hour) => hour.rows.length === 12);
  const peak = complete && known.length ? Math.max(...known) : null;
  const max = Math.max(1, ...known);
  const plotHeight = Math.max(1, height - 38);
  const step = width / 6;
  const bands = [...new Set(hours.flatMap((hour) => hour.rows.map((row) => row.band)))];
  return (
    <div className="hcr-chart">
      <HamClockButton onClick={() => setShowLive((value) => !value)}>
        {showLive ? "VIEW SIX COMPLETED HOURS" : "VIEW CURRENT-HOUR SAMPLES"}
      </HamClockButton>
      <p className="hcr-chart-title">
        {showLive ? "GLOBAL · 10 MIN AT SAMPLE TIME" : "GLOBAL · 6 COMPLETED HOURS"} · PEAK {peak === null ? "UNKNOWN" : peak.toLocaleString()}
      </p>
      <div className="hcr-plot" ref={ref}>
        <svg
          role="img"
          aria-label={showLive ? "Global current-hour samples; trailing ten-minute counts" : "Global hourly band counts; missing hours labeled unknown"}
          viewBox={`0 0 ${width} ${height}`}
        >
          {hours.map((hour, index) => {
            let cumulative = 0;
            return (
              <g key={hour.hour}>
                {hour.rows.map((row) => {
                  cumulative += row.count;
                  return (
                    <rect
                      key={row.band}
                      x={(index + 0.15) * step}
                      y={plotHeight * (1 - cumulative / max)}
                      width={step * 0.7}
                      height={(plotHeight * row.count) / max}
                      fill={getBandColor(row.band)}
                    />
                  );
                })}
                {hour.count === null && (
                  <text
                    x={(index + 0.5) * step}
                    y={plotHeight / 2}
                    textAnchor="middle"
                    fill="var(--hc-dim)"
                    fontSize={Math.max(12, height * 0.075)}
                  >
                    {hour.future ? "NOT YET" : "UNKNOWN"}
                  </text>
                )}
                {hour.count !== null && hour.rows.length < 12 && (
                  <text x={(index + 0.5) * step} y={14} textAnchor="middle" fill="var(--hc-fg)" fontSize={12}>PARTIAL</text>
                )}
                <text
                  x={(index + 0.5) * step}
                  y={height - 5}
                  textAnchor="middle"
                  fill="var(--hc-dim)"
                  fontSize={Math.max(12, height * 0.085)}
                >
                  {hour.hour.slice(11, 16)}Z
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="hcr-chart-title">
        {bands.map((band) => (
          <span key={band} style={{ color: getBandColor(band) }}>
            {band.toUpperCase()} ·{" "}
          </span>
        ))}
        {showLive ? "GAPS UNKNOWN" : "MISSING = UNKNOWN"}
      </p>
      <table className="sr-only">
        <caption>
          {showLive ? "Global live samples · actual sample UTC · trailing ten-minute raw reports" : "Global band history · completed UTC hours · raw reports"}
        </caption>
        <thead>
          <tr>
            <th>UTC hour</th>
            <th>Band</th>
            <th>Reports</th>
            <th>Sources</th>
          </tr>
        </thead>
        <tbody>
          {hours.flatMap((hour) =>
            hour.rows.length
              ? hour.rows.map((row) => (
                  <tr key={`${hour.hour}-${row.band}`}>
                    <td>{hour.hour}</td>
                    <td>{row.band}</td>
                    <td>{row.count}</td>
                    <td>
                      {Object.entries(row.sources)
                        .map(([source, count]) => `${source}: ${count}`)
                        .join(", ")}
                    </td>
                  </tr>
                ))
              : [
                  <tr key={hour.hour}>
                    <td>{hour.hour}</td>
                    <td>Unknown</td>
                    <td>Unknown</td>
                    <td>Unknown</td>
                  </tr>,
                ],
          )}
        </tbody>
      </table>
    </div>
  );
}
