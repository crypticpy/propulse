/**
 * useActiveBandMode - Convenience selectors for the active operating band/mode
 *
 * All 28+ consumer components import from here rather than directly from operatingStore,
 * providing a stable API surface and optimized re-render boundaries.
 */

import { useOperatingStore } from "@/stores/operatingStore";
import type { OperatingSource } from "@/stores/operatingStore";
import type { BandId } from "@/types/user";
import type { UIMode } from "@/lib/utils/modeNormalize";

// Re-export types for consumer convenience
export type { UIMode, OperatingSource };

/** Full active operating state */
export function useActiveBandMode() {
  const activeBand = useOperatingStore((s) => s.activeBand);
  const activeMode = useOperatingStore((s) => s.activeMode);
  const activeSource = useOperatingStore((s) => s.activeSource);
  const activeFrequency = useOperatingStore((s) => s.activeFrequency);

  return { activeBand, activeMode, activeSource, activeFrequency };
}

/** Just the active band (minimizes re-renders for band-only consumers) */
export function useActiveBand(): BandId {
  return useOperatingStore((s) => s.activeBand);
}

/** Just the active mode */
export function useActiveMode(): UIMode {
  return useOperatingStore((s) => s.activeMode);
}

/** Just the active frequency in Hz */
export function useActiveFrequency(): number {
  return useOperatingStore((s) => s.activeFrequency);
}

/** The source driving the current active state */
export function useActiveSource(): OperatingSource {
  return useOperatingStore((s) => s.activeSource);
}

/** Whether CAT is currently overridden by manual selection */
export function useCATOverridden(): boolean {
  return useOperatingStore((s) => s.catOverridden);
}
