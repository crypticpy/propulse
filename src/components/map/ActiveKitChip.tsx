/**
 * Compact active-kit chip for PropSphere. Shows the live chain name and ERP
 * on the current band; tap to switch among named paths (home / POTA pack).
 */

import { useMemo, useState } from "react";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import {
  useActiveChain,
  useShackStore,
  useStationChains,
} from "@/stores/shackStore";

function formatErp(watts: number): string {
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)}kW`;
  if (watts >= 10) return `${Math.round(watts)}W`;
  return `${watts.toFixed(1)}W`;
}

export function ActiveKitChip({ className = "" }: { className?: string }) {
  const chains = useStationChains();
  const chain = useActiveChain();
  const setActiveChain = useShackStore((state) => state.setActiveChain);
  const band = useActiveBand();
  const performance = useChainPerformance();
  const [open, setOpen] = useState(false);

  const erp = useMemo(() => {
    const match =
      performance.bands.find((item) => item.band === band) ??
      performance.bands.find((item) => item.band === "20m") ??
      performance.bands[0];
    return match?.erpWatts;
  }, [band, performance.bands]);

  if (chains.length === 0) return null;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-void-black/80 px-2 py-1 text-left hover:border-plasma-orange/40"
      >
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wide text-gray-300">
          {chain?.name ?? "No path"}
        </span>
        {erp != null && (
          <span className="shrink-0 font-mono text-[10px] text-plasma-orange">
            {band} {formatErp(erp)}
          </span>
        )}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-lg border border-white/10 bg-deep-space py-1 shadow-lg"
        >
          {chains.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item.id === chain?.id}
                onClick={() => {
                  setActiveChain(item.id);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  item.id === chain?.id
                    ? "text-plasma-orange"
                    : "text-gray-300 hover:bg-white/5"
                }`}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
