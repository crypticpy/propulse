/**
 * "Where to Find Me" container section for the operator profile.
 * Assembles operating hours clock, active days chart, sked availability,
 * and favorite frequencies into a cohesive section.
 */

import type { FavoriteFrequency, SkedAvailability } from "@/types/social";
import { OperatingHoursChart } from "./OperatingHoursChart";
import { ActiveDaysChart } from "./ActiveDaysChart";
import { FavoriteFreqList } from "./FavoriteFreqList";

interface WhereToFindMeProps {
  hours?: number[]; // 24-element UTC hour distribution
  qsosByDate?: Record<string, number>;
  favoriteFreqs?: FavoriteFrequency[];
  skedAvailability?: SkedAvailability;
  editable?: boolean;
  onSkedChange?: (avail: SkedAvailability) => void;
  onFreqAdd?: (freq: Omit<FavoriteFrequency, "id">) => void;
  onFreqRemove?: (id: string) => void;
}

const SKED_CONFIG: Record<
  SkedAvailability,
  { label: string; className: string }
> = {
  open: {
    label: "Open for Skeds",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  busy: {
    label: "Busy",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  offline: {
    label: "Offline",
    className: "bg-white/5 text-gray-500 border-white/10",
  },
};

const SKED_OPTIONS: SkedAvailability[] = ["open", "busy", "offline"];

export function WhereToFindMe({
  hours,
  qsosByDate,
  favoriteFreqs,
  skedAvailability = "offline",
  editable = false,
  onSkedChange,
  onFreqAdd,
  onFreqRemove,
}: WhereToFindMeProps) {
  const hasHours = hours && hours.some((h) => h > 0);
  const hasDays = qsosByDate && Object.keys(qsosByDate).length > 0;
  const hasFreqs = favoriteFreqs && favoriteFreqs.length > 0;
  const hasData = hasHours || hasDays || hasFreqs;

  const sked = SKED_CONFIG[skedAvailability];

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-0">
          Where to Find Me
        </h3>

        {/* Sked availability badge or toggle */}
        {editable && onSkedChange ? (
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {SKED_OPTIONS.map((opt) => {
              const cfg = SKED_CONFIG[opt];
              const isActive = skedAvailability === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSkedChange(opt)}
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors border-0 ${
                    isActive
                      ? cfg.className
                      : "bg-white/[0.02] text-gray-600 hover:text-gray-400 hover:bg-white/5"
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${sked.className}`}
          >
            {sked.label}
          </span>
        )}
      </div>

      {/* No data fallback */}
      {!hasData && !editable && (
        <p className="text-gray-500 text-xs italic py-4 text-center">
          No operating data yet
        </p>
      )}

      {/* Charts row: side-by-side on desktop, stacked on mobile */}
      {(hasHours || hasDays) && (
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {hasHours && hours && (
            <div className="shrink-0">
              <p className="text-[9px] uppercase tracking-widest text-gray-600 mb-2">
                Operating Hours (UTC)
              </p>
              <OperatingHoursChart hours={hours} size={180} />
            </div>
          )}
          {hasDays && qsosByDate && (
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase tracking-widest text-gray-600 mb-2">
                Active Days
              </p>
              <ActiveDaysChart qsosByDate={qsosByDate} />
            </div>
          )}
        </div>
      )}

      {/* Favorite frequencies */}
      {(hasFreqs || editable) && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-gray-600 mb-2">
            Favorite Frequencies
          </p>
          <FavoriteFreqList
            freqs={favoriteFreqs ?? []}
            editable={editable}
            onAdd={onFreqAdd}
            onRemove={onFreqRemove}
          />
        </div>
      )}
    </div>
  );
}
