/**
 * DxpeditionsCard Component (E6 parity)
 *
 * Dashboard card listing upcoming and currently-active DXpedition
 * operations, sourced from NG3K's Announced DX Operations page via the
 * /api/dx/dxpeditions edge proxy.
 *
 * @module components/dashboard/DxpeditionsCard
 */

import { Card } from "@/components/ui/Card";
import {
  useDxpeditions,
  formatDateRange,
  partitionActive,
} from "@/hooks/useDxpeditions";

const MAX_VISIBLE_ROWS = 8;

export interface DxpeditionsCardProps {
  className?: string;
}

export function DxpeditionsCard({ className = "" }: DxpeditionsCardProps) {
  const { entries, status, isLoading } = useDxpeditions();
  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = partitionActive(entries, todayIso);
  const degraded = status !== "ok";

  return (
    <Card className={className} role="region" aria-label="DXpeditions">
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span className="text-sm font-medium text-su-muted uppercase tracking-wide">
          DXpeditions
        </span>
        <span className="text-sm text-su-muted/80">NG3K ADXO</span>
      </div>

      {degraded && !isLoading && (
        <div className="text-sm text-su-muted/80">DXpedition list unavailable</div>
      )}

      {!degraded && !isLoading && rows.length === 0 && (
        <div className="text-sm text-su-muted/80">No upcoming operations</div>
      )}

      {!degraded && rows.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-su-line/20">
          {rows.slice(0, MAX_VISIBLE_ROWS).map(({ entry, isActive }) => (
            <div key={`${entry.callsign}-${entry.startDate}`} className="py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-mono text-su-info font-semibold truncate shrink-0">
                  {entry.callsign}
                </span>
                {isActive && (
                  <span className="text-sm font-medium text-su-success bg-su-success/10 border border-su-success/30 rounded px-1 py-px shrink-0">
                    QRV
                  </span>
                )}
                <span className="text-sm text-su-muted truncate min-w-0 flex-1">
                  {entry.entity}
                </span>
                <span className="text-sm font-mono tabular-nums text-su-muted/80 shrink-0">
                  {formatDateRange(entry.startDate, entry.endDate)}
                </span>
              </div>
              {(entry.bands || entry.modes) && (
                <div className="text-sm text-su-muted/80 truncate">
                  {[entry.bands, entry.modes].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

DxpeditionsCard.displayName = "DxpeditionsCard";

export default DxpeditionsCard;
