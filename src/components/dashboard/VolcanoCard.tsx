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
  GREEN: "bg-su-success/15 border-su-success/30 text-su-success",
  YELLOW: "bg-su-warning/15 border-su-warning/30 text-su-warning",
  ORANGE: "bg-su-accent/15 border-su-accent/30 text-su-accent",
  RED: "bg-su-danger/15 border-su-danger/30 text-su-danger",
};

function colorCodeStyle(colorCode: string): string {
  return (
    COLOR_CODE_STYLES[colorCode] ?? "bg-su-input border-su-line/40 text-su-muted"
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
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <span
          className={`text-sm font-mono px-1.5 py-0.5 rounded border shrink-0 ${colorCodeStyle(volcano.colorCode)}`}
        >
          {volcano.alertLevel}
        </span>
        <span className="text-su-text truncate">{volcano.volcanoName}</span>
      </div>
      <div className="text-sm text-su-muted/80 pl-1">
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
        <span className="text-sm font-medium text-su-muted uppercase tracking-wide">
          Volcano Watch &mdash; USGS
        </span>
      </div>

      {error && (
        <div className="text-sm text-su-muted/80">Volcano status unavailable</div>
      )}

      {!error && !isLoading && severe.length > 0 && (
        <div className="space-y-1.5">
          {severe.map((volcano) => (
            <SevereRow key={volcano.volcanoName} volcano={volcano} />
          ))}
        </div>
      )}

      {!error && !isLoading && severe.length === 0 && (
        <div className="text-sm">
          <div className="text-su-muted">
            {elevated.length > 0
              ? `${elevated.length} volcano${elevated.length === 1 ? "" : "es"} at ADVISORY — none at WATCH/WARNING`
              : "No volcanoes at elevated alert levels"}
          </div>
          {elevated.length > 0 && (
            <div className="text-sm text-su-muted/80 mt-1 truncate">
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
