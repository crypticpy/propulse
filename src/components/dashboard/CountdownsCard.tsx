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
      <span className="text-sm text-white truncate min-w-0 flex-1">
        {countdown.name}
      </span>
      <span
        className={`text-xs font-mono tabular-nums shrink-0 ${ended ? "text-gray-500" : "text-gray-200"}`}
      >
        {text}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-400 hover:text-alert-red px-1 shrink-0"
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
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Countdowns
        </span>
      </div>

      {items.length > 0 ? (
        <div className="divide-y divide-white/5 mb-2">
          {items.map((item) => (
            <CountdownRow
              key={item.id}
              countdown={item}
              onRemove={() => removeCountdown(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-500 mb-2">No countdowns yet</div>
      )}

      <div className="pt-2 border-t border-white/10 space-y-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name"
          maxLength={40}
          className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-200 placeholder:text-gray-500"
          aria-label="Countdown name"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={targetLocal}
            onChange={(e) => setTargetLocal(e.target.value)}
            className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-200"
            aria-label="Countdown target date and time"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="text-xs font-medium text-white bg-plasma-orange/80 hover:bg-plasma-orange disabled:opacity-30 disabled:hover:bg-plasma-orange/80 rounded-lg px-3 py-1.5 shrink-0"
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
