/**
 * AwardProgressRing - SVG ring component showing award progress.
 *
 * Renders two concentric arcs: outer ring for "worked" entities,
 * inner ring for "confirmed" entities, with a centered fraction label.
 */

interface AwardProgressRingProps {
  /** Count of entities worked */
  worked: number;
  /** Count of entities confirmed */
  confirmed: number;
  /** Total possible entities (e.g., DXCC ~340, WAS 50, WAZ 40) */
  total: number;
  /** Award label displayed below the ring */
  label: string;
  /** Stroke color for the worked (outer) arc */
  workedColor?: string;
  /** Stroke color for the confirmed (inner) arc */
  confirmedColor?: string;
  /** Diameter of the SVG in pixels */
  size?: number;
}

export function AwardProgressRing({
  worked,
  confirmed,
  total,
  label,
  workedColor = "#3b82f6",
  confirmedColor = "#22c55e",
  size = 120,
}: AwardProgressRingProps) {
  const strokeWidth = 8;
  const gap = 6;

  // Outer ring (worked)
  const outerRadius = (size - strokeWidth) / 2;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const workedFraction = total > 0 ? Math.min(worked / total, 1) : 0;
  const outerDashOffset = outerCircumference * (1 - workedFraction);

  // Inner ring (confirmed)
  const innerRadius = outerRadius - strokeWidth - gap;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const confirmedFraction = total > 0 ? Math.min(confirmed / total, 1) : 0;
  const innerDashOffset = innerCircumference * (1 - confirmedFraction);

  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          aria-label={`${label}: ${confirmed} confirmed, ${worked} worked of ${total}`}
          role="img"
        >
          {/* Outer background track */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Outer arc: worked */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke={workedColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={outerCircumference}
            strokeDashoffset={outerDashOffset}
            style={{ transition: "stroke-dashoffset 0.6s ease-in-out" }}
          />
          {/* Inner background track */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Inner arc: confirmed */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke={confirmedColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={innerCircumference}
            strokeDashoffset={innerDashOffset}
            style={{ transition: "stroke-dashoffset 0.6s ease-in-out" }}
          />
        </svg>

        {/* Centered text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white leading-none">
            {confirmed}
          </span>
          <span className="text-[10px] text-gray-400 leading-none mt-0.5">
            / {total}
          </span>
        </div>
      </div>

      {/* Label below ring */}
      <span className="text-xs font-semibold tracking-wider text-gray-300 uppercase">
        {label}
      </span>
    </div>
  );
}
