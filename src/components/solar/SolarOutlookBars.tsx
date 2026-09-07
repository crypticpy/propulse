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

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex h-40 shrink-0 flex-col justify-between text-[10px] text-su-muted">
          <span>{Math.round(maxFlux)} sfu</span>
          <span>{Math.round(minFlux)} sfu</span>
        </div>
        <div className="flex h-40 flex-1 items-end gap-0.5 sm:gap-1">
          {outlook.map((day) => {
            const dateObj = new Date(day.date);
            const isToday = day.date.slice(0, 10) === todayKey;
            const dayLabel = dateObj.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" });
            const monthLabel = dateObj.toLocaleDateString(undefined, { timeZone: "UTC", month: "short" });
            const showMonth = monthLabel !== lastMonth;
            lastMonth = monthLabel;
            const description = `${dayLabel} · Kp ${day.predicted_kp} · A ${day.predicted_planetary_a} · flux ${day.predicted_flux} sfu`;
            return (
              <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div
                  role="img"
                  aria-label={description}
                  title={description}
                  className={`w-full rounded-t ${outlookKpToneClass(day.predicted_kp)} ${isToday ? "outline outline-2 outline-su-accent" : ""}`}
                  style={{ height: `${barHeight(day.predicted_flux)}%` }}
                />
                <span className="whitespace-nowrap text-[10px] text-su-muted">
                  {showMonth ? `${monthLabel} ${dateObj.getUTCDate()}` : dateObj.getUTCDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs leading-5 text-su-muted">Bar height = predicted flux (sfu); colour = predicted Kp tier.</p>
    </div>
  );
}
