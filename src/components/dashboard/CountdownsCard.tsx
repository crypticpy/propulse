/**
 * CountdownsCard Component (G11)
 *
 * Dashboard card for named countdowns to arbitrary events (band openings,
 * exam dates, QSL deadlines, etc). Inline add form only -- no flyouts.
 *
 * @module components/dashboard/CountdownsCard
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useCountdownStore, type NamedCountdown } from "@/stores/countdownStore";
import { useCountdown } from "@/hooks/useCountdown";

function CountdownRow({
  countdown,
  onRemove,
}: {
  countdown: NamedCountdown;
  onRemove: () => void;
}) {
  const { text, ended } = useCountdown(countdown.targetUtc);

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-su-text truncate min-w-0 flex-1">
        {countdown.name}
      </span>
      <span
        className={`text-sm font-mono tabular-nums shrink-0 ${ended ? "text-su-muted/80" : "text-su-text"}`}
      >
        {text}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-su-muted hover:text-su-danger px-1 shrink-0"
        aria-label={`Remove ${countdown.name}`}
      >
        ✕
      </button>
    </div>
  );
}

export interface CountdownsCardProps {
  className?: string;
}

export function CountdownsCard({ className = "" }: CountdownsCardProps) {
  const items = useCountdownStore((s) => s.items);
  const addCountdown = useCountdownStore((s) => s.addCountdown);
  const removeCountdown = useCountdownStore((s) => s.removeCountdown);
  const pruneExpired = useCountdownStore((s) => s.pruneExpired);

  const [name, setName] = useState("");
  const [targetLocal, setTargetLocal] = useState("");

  useEffect(() => {
    pruneExpired();
    // Prune only needs to run once when the card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetMs = targetLocal ? new Date(targetLocal).getTime() : NaN;
  const canAdd =
    name.trim().length > 0 && Number.isFinite(targetMs) && targetMs > Date.now();

  const handleAdd = () => {
    if (!canAdd) return;
    addCountdown(name.trim(), new Date(targetLocal).toISOString());
    setName("");
    setTargetLocal("");
  };

  return (
    <Card className={className} role="region" aria-label="Countdowns">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm font-medium text-su-muted uppercase tracking-wide">
          Countdowns
        </span>
      </div>

      {items.length > 0 ? (
        <div className="divide-y divide-su-line/20 mb-2">
          {items.map((item) => (
            <CountdownRow
              key={item.id}
              countdown={item}
              onRemove={() => removeCountdown(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm text-su-muted/80 mb-2">No countdowns yet</div>
      )}

      <div className="pt-2 border-t border-su-line/40 space-y-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name"
          maxLength={40}
          className="w-full text-sm bg-su-input border border-su-line/40 rounded-lg px-2 py-1.5 text-su-text placeholder:text-su-muted/80"
          aria-label="Countdown name"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={targetLocal}
            onChange={(e) => setTargetLocal(e.target.value)}
            className="flex-1 min-w-0 text-sm bg-su-input border border-su-line/40 rounded-lg px-2 py-1.5 text-su-text"
            aria-label="Countdown target date and time"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="text-sm font-medium text-su-on-accent bg-su-accent/80 hover:bg-su-accent disabled:opacity-30 disabled:hover:bg-su-accent/80 rounded-lg px-3 py-1.5 shrink-0"
          >
            Add
          </button>
        </div>
      </div>
    </Card>
  );
}

CountdownsCard.displayName = "CountdownsCard";

export default CountdownsCard;
