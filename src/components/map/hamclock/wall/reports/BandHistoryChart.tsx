import { useMemo, useRef } from "react";
import {
  bandHistoryHours,
  type BandHistorySnapshot,
} from "@/lib/hamclock/bandHistory";
import { getBandColor } from "@/lib/utils/spotColors";
import { useElementSize } from "../useElementSize";

/** Separate completed-hour raw counts from the live partial-window counters. */
export function BandHistoryChart({
  snapshot,
}: {
  snapshot: BandHistorySnapshot;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || 800;
  const height = measured.height || 220;
  const hours = useMemo(() => bandHistoryHours(snapshot), [snapshot]);
  const known = hours.flatMap((hour) => hour.count === null ? [] : [hour.count]);
  const peak = known.length ? Math.max(...known) : null;
  const max = Math.max(1, peak ?? 0);
  const plotHeight = Math.max(1, height - 38);
  const step = width / 6;
  const bands = [...new Set(snapshot.rows.map((row) => row.band))];
  return (
    <div className="hcr-chart">
      <p className="hcr-chart-title">
        GLOBAL SPOTS — 6 COMPLETED HOURS · PEAK {peak === null ? "UNKNOWN" : peak.toLocaleString()}
      </p>
      <div className="hcr-plot" ref={ref}>
        <svg
          role="img"
          aria-label="Global hourly band counts; missing hours labeled unknown"
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
                    UNKNOWN
                  </text>
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
        Missing band/hour rows are unknown.
      </p>
      <table className="sr-only">
        <caption>
          Global band history · completed UTC hours · raw reports
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
                  <tr key={`${row.hour}-${row.band}`}>
                    <td>{row.hour}</td>
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
