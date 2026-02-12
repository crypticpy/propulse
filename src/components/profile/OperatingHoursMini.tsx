/**
 * OperatingHoursMini — Ultra-compact 24-hour activity strip for the sidebar.
 *
 * Renders a single horizontal row of 24 thin cells whose opacity is
 * proportional to the QSO count for each UTC hour. No labels — purely visual.
 */

interface OperatingHoursMiniProps {
  /** 24-element array of QSO counts per UTC hour (index 0 = 00:00 UTC) */
  hours: number[];
  /** CSS color value for the bar fill. Defaults to the rank accent or orange. */
  accentColor?: string;
}

export function OperatingHoursMini({
  hours,
  accentColor = "var(--rank-accent, #f97316)",
}: OperatingHoursMiniProps) {
  const max = Math.max(...hours, 1); // avoid division by zero

  return (
    <div
      className="flex items-center justify-center gap-px"
      role="img"
      aria-label="Operating hours distribution (24h UTC)"
    >
      {hours.map((count, h) => {
        const opacity = 0.1 + 0.8 * (count / max);
        return (
          <div
            key={h}
            className="rounded-[1px]"
            style={{
              width: 4,
              height: 14,
              backgroundColor: accentColor,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}
