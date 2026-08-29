/**
 * VolcanoCard Component (E6 parity)
 *
 * Dashboard card showing USGS-tracked volcanoes at an elevated alert level.
 * Volcanoes at WATCH/WARNING (or ORANGE/RED) are surfaced prominently;
 * otherwise the card shows a quiet summary of any ADVISORY-level activity.
 *
 * @module components/dashboard/VolcanoCard
 */

import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/Card";
import {
  useVolcanoes,
  partitionBySeverity,
  type Volcano,
} from "@/hooks/useVolcanoes";

const COLOR_CODE_STYLES: Record<string, string> = {
  GREEN: "bg-signal-green/15 border-signal-green/30 text-signal-green",
  YELLOW: "bg-caution-amber/15 border-caution-amber/30 text-caution-amber",
  ORANGE: "bg-plasma-orange/15 border-plasma-orange/30 text-plasma-orange",
  RED: "bg-alert-red/15 border-alert-red/30 text-alert-red",
};

function colorCodeStyle(colorCode: string): string {
  return (
    COLOR_CODE_STYLES[colorCode] ?? "bg-white/5 border-white/10 text-gray-400"
  );
}

function relativeUpdate(lastUpdate: string | null): string | null {
  if (!lastUpdate) return null;
  const date = new Date(lastUpdate);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

function SevereRow({ volcano }: { volcano: Volcano }) {
  const updated = relativeUpdate(volcano.lastUpdate);
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${colorCodeStyle(volcano.colorCode)}`}
        >
          {volcano.alertLevel}
        </span>
        <span className="text-gray-200 truncate">{volcano.volcanoName}</span>
      </div>
      <div className="text-[10px] text-gray-500 pl-1">
        {volcano.obsAbbr}
        {updated ? ` · ${updated}` : ""}
      </div>
    </div>
  );
}

export interface VolcanoCardProps {
  className?: string;
}

export function VolcanoCard({ className = "" }: VolcanoCardProps) {
  const { volcanoes, isLoading, error } = useVolcanoes();
  const { severe, elevated } = partitionBySeverity(volcanoes);

  return (
    <Card className={className} role="region" aria-label="Volcano Watch">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Volcano Watch &mdash; USGS
        </span>
      </div>

      {error && (
        <div className="text-xs text-gray-500">Volcano status unavailable</div>
      )}

      {!error && !isLoading && severe.length > 0 && (
        <div className="space-y-1.5">
          {severe.map((volcano) => (
            <SevereRow key={volcano.volcanoName} volcano={volcano} />
          ))}
        </div>
      )}

      {!error && !isLoading && severe.length === 0 && (
        <div className="text-xs">
          <div className="text-gray-400">
            {elevated.length > 0
              ? `${elevated.length} volcano${elevated.length === 1 ? "" : "es"} at ADVISORY — none at WATCH/WARNING`
              : "No volcanoes at elevated alert levels"}
          </div>
          {elevated.length > 0 && (
            <div className="text-[10px] text-gray-500 mt-1 truncate">
              {elevated.map((v) => v.volcanoName).join(", ")}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

VolcanoCard.displayName = "VolcanoCard";

export default VolcanoCard;
