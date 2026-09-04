/**
 * Compact active-kit chip for PropSphere. Shows the live chain name and ERP
 * on the current band; native select so Home ↔ POTA pack is keyboard operable.
 */

import { useMemo } from "react";
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

  const erp = useMemo(() => {
    const match =
      performance.bands.find((item) => item.band === band) ??
      performance.bands.find((item) => item.band === "20m") ??
      performance.bands[0];
    return match?.erpWatts;
  }, [band, performance.bands]);

  if (chains.length === 0) return null;

  return (
    <div className={`flex max-w-[240px] items-center gap-2 ${className}`}>
      <select
        aria-label="Active station path"
        value={chain?.id ?? ""}
        onChange={(event) => {
          if (event.target.value) setActiveChain(event.target.value);
        }}
        className="min-w-0 max-w-[140px] truncate rounded-lg border border-white/10 bg-void-black/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-gray-300 hover:border-plasma-orange/40"
      >
        {chains.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {erp != null && (
        <span className="shrink-0 font-mono text-[10px] text-plasma-orange">
          {band} {formatErp(erp)}
        </span>
      )}
    </div>
  );
}
