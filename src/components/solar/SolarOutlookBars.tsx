import type { SolarFluxOutlookPoint } from "@/lib/solar/dataTypes";

/** DS-04 ink-on-tone rule: filled cells use text-su-canvas for contrast, not text-su-text. */
export function outlookKpToneClass(kp: number): string {
  if (kp >= 5) return "bg-su-danger/80";
  if (kp === 4) return "bg-su-warning/80";
  return "bg-su-success/80";
}

/** Lowest bar is still a visible sliver rather than collapsing to nothing. */
const FLOOR_RATIO = 0.08;

export interface SolarOutlookBarsProps {
  outlook: SolarFluxOutlookPoint[];
}

/**
 * Single full-width bar chart for the 27-day outlook: one column per day,
 * bar height driven by predicted flux (scaled between the outlook's own
 * min/max), bar colour driven by the predicted Kp tier. Replaces the old
 * 27-cell strip-plus-separate-flux-chart pairing (#578).
 */
export function SolarOutlookBars({ outlook }: SolarOutlookBarsProps) {
  if (outlook.length === 0) return null;

  const fluxValues = outlook.map((day) => day.predicted_flux);
  const minFlux = Math.min(...fluxValues);
  const maxFlux = Math.max(...fluxValues);
  const spread = maxFlux - minFlux;
  const todayKey = new Date().toISOString().slice(0, 10);

  const barHeight = (flux: number) => {
    if (spread <= 0) return 100;
    return Math.max(FLOOR_RATIO, (flux - minFlux) / spread) * 100;
  };

  let lastMonth = "";
  const columns = outlook.map((day) => {
    const dateObj = new Date(day.date);
    const dayLabel = dateObj.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" });
    const monthLabel = dateObj.toLocaleDateString(undefined, { timeZone: "UTC", month: "short" });
    const showMonth = monthLabel !== lastMonth;
    lastMonth = monthLabel;
    return {
      key: day.date,
      isToday: day.date.slice(0, 10) === todayKey,
      dayOfMonth: dateObj.getUTCDate(),
      monthLabel: showMonth ? monthLabel : null,
      description: `${dayLabel} · Kp ${day.predicted_kp} · A ${day.predicted_planetary_a} · flux ${day.predicted_flux} sfu`,
      tone: outlookKpToneClass(day.predicted_kp),
      height: barHeight(day.predicted_flux),
    };
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Axis labels share the plot row's height exactly; the date rows sit below it. */}
        <div className="flex h-32 shrink-0 flex-col justify-between text-[10px] text-su-muted">
          <span>{Math.round(maxFlux)} sfu</span>
          <span>{Math.round(minFlux)} sfu</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-32 items-end gap-0.5 sm:gap-1">
            {columns.map((column) => (
              <div key={column.key} className="flex h-full min-w-0 flex-1 items-end">
                <div
                  role="img"
                  aria-label={column.description}
                  title={column.description}
                  className={`w-full rounded-t ${column.tone} ${column.isToday ? "outline outline-2 outline-su-accent" : ""}`}
                  style={{ height: `${column.height}%` }}
                />
              </div>
            ))}
          </div>
          {/* Month names spill over the empty neighbouring columns; min-w-0 keeps them from widening the row. */}
          <div className="mt-1 flex gap-0.5 sm:gap-1">
            {columns.map((column) => (
              <span key={column.key} className="min-w-0 flex-1 whitespace-nowrap text-[9px] font-semibold uppercase text-su-muted sm:text-[10px]">
                {column.monthLabel}
              </span>
            ))}
          </div>
          <div className="flex gap-0.5 sm:gap-1">
            {columns.map((column) => (
              <span key={column.key} className="min-w-0 flex-1 overflow-hidden text-center text-[9px] text-su-muted sm:text-[10px]">
                {column.dayOfMonth}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs leading-5 text-su-muted">Bar height = predicted flux (sfu); colour = predicted Kp tier.</p>
    </div>
  );
}
