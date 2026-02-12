/**
 * Circular 24-hour clock-face SVG showing QSO distribution by UTC hour.
 * Each hour is rendered as a wedge arc with opacity proportional to activity.
 */

import { useMemo, useState } from "react";

interface OperatingHoursChartProps {
  hours: number[]; // 24 elements, index = UTC hour, value = QSO count
  size?: number; // default 200
  accentColor?: string; // default "var(--rank-accent, #f97316)"
}

const DEG_PER_HOUR = 360 / 24; // 15°
const INNER_RADIUS = 30;
const OUTER_RADIUS = 80;
const CENTER = 100;

/** Convert degrees to radians */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Compute SVG arc path for a wedge between two angles at given radii */
function wedgePath(
  startDeg: number,
  endDeg: number,
  innerR: number,
  outerR: number,
): string {
  const startRad = toRad(startDeg);
  const endRad = toRad(endDeg);

  const outerX1 = CENTER + outerR * Math.cos(startRad);
  const outerY1 = CENTER + outerR * Math.sin(startRad);
  const outerX2 = CENTER + outerR * Math.cos(endRad);
  const outerY2 = CENTER + outerR * Math.sin(endRad);
  const innerX1 = CENTER + innerR * Math.cos(endRad);
  const innerY1 = CENTER + innerR * Math.sin(endRad);
  const innerX2 = CENTER + innerR * Math.cos(startRad);
  const innerY2 = CENTER + innerR * Math.sin(startRad);

  // All arcs are less than 180°, so large-arc-flag = 0
  return [
    `M ${outerX1} ${outerY1}`,
    `A ${outerR} ${outerR} 0 0 1 ${outerX2} ${outerY2}`,
    `L ${innerX1} ${innerY1}`,
    `A ${innerR} ${innerR} 0 0 0 ${innerX2} ${innerY2}`,
    "Z",
  ].join(" ");
}

const CARDINAL_LABELS: {
  hour: number;
  label: string;
  dx: number;
  dy: number;
}[] = [
  { hour: 0, label: "00z", dx: 0, dy: -8 }, // top
  { hour: 6, label: "06z", dx: 8, dy: 0 }, // right
  { hour: 12, label: "12z", dx: 0, dy: 8 }, // bottom
  { hour: 18, label: "18z", dx: -8, dy: 0 }, // left
];

export function OperatingHoursChart({
  hours,
  size = 200,
  accentColor = "var(--rank-accent, #f97316)",
}: OperatingHoursChartProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const { wedges, peakHour } = useMemo(() => {
    const max = Math.max(...hours, 1); // avoid division by zero
    let peak = 0;
    for (let i = 1; i < 24; i++) {
      if (hours[i] > hours[peak]) peak = i;
    }

    const result = hours.map((count, h) => {
      const startDeg = h * DEG_PER_HOUR - 90; // -90 so hour 0 is at top
      const endDeg = (h + 1) * DEG_PER_HOUR - 90;
      const normalized = count / max;
      const opacity = Math.max(0.08, Math.min(0.9, normalized * 0.9));
      return {
        hour: h,
        count,
        path: wedgePath(startDeg, endDeg, INNER_RADIUS, OUTER_RADIUS),
        opacity,
      };
    });

    return { wedges: result, peakHour: peak };
  }, [hours]);

  // Position for tooltip — place near the hovered wedge
  const tooltipInfo = useMemo(() => {
    if (hoveredHour === null) return null;
    const midDeg = hoveredHour * DEG_PER_HOUR + DEG_PER_HOUR / 2 - 90;
    const tooltipR = OUTER_RADIUS + 14;
    const x = CENTER + tooltipR * Math.cos(toRad(midDeg));
    const y = CENTER + tooltipR * Math.sin(toRad(midDeg));
    return { x, y, hour: hoveredHour, count: hours[hoveredHour] };
  }, [hoveredHour, hours]);

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="block"
        role="img"
        aria-label="Operating hours clock showing QSO distribution across 24 UTC hours"
      >
        {/* Wedge arcs */}
        {wedges.map((w) => (
          <path
            key={w.hour}
            d={w.path}
            fill={accentColor}
            opacity={w.opacity}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={0.5}
            className="cursor-pointer transition-opacity duration-150"
            onMouseEnter={() => setHoveredHour(w.hour)}
            onMouseLeave={() => setHoveredHour(null)}
          />
        ))}

        {/* Cardinal labels */}
        {CARDINAL_LABELS.map(({ hour, label, dx, dy }) => {
          const angleDeg = hour * DEG_PER_HOUR - 90;
          const labelR = OUTER_RADIUS + 12;
          const x = CENTER + labelR * Math.cos(toRad(angleDeg)) + dx;
          const y = CENTER + labelR * Math.sin(toRad(angleDeg)) + dy;
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-500"
              fontSize={9}
              fontFamily="monospace"
            >
              {label}
            </text>
          );
        })}

        {/* Center text */}
        <text
          x={CENTER}
          y={CENTER - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-400"
          fontSize={10}
          fontFamily="sans-serif"
        >
          Peak
        </text>
        <text
          x={CENTER}
          y={CENTER + 8}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-400"
          fontSize={11}
          fontFamily="monospace"
          fontWeight="bold"
        >
          {String(peakHour).padStart(2, "0")}z
        </text>
      </svg>

      {/* Tooltip */}
      {tooltipInfo && (
        <div
          className="absolute pointer-events-none z-10 rounded-lg bg-gray-900/95 border border-white/10 px-2.5 py-1.5 text-xs text-gray-200 whitespace-nowrap shadow-lg"
          style={{
            left: (tooltipInfo.x / 200) * size,
            top: (tooltipInfo.y / 200) * size,
            transform: "translate(-50%, -50%)",
          }}
        >
          {String(tooltipInfo.hour).padStart(2, "0")}:00 UTC —{" "}
          {tooltipInfo.count} QSO{tooltipInfo.count !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
