/** React adapter for the canonical pure station-chain engine. */

import { useMemo } from "react";
import {
  useActiveChain,
  useInlineComponents,
  useStationChains,
  useUserAccessories,
  useUserAntennas,
  useUserFeedlines,
  useUserRadios,
} from "@/stores/shackStore";
import {
  computeStationChainPerformance,
  type ChainPerformanceResult,
} from "@/lib/station/stationChainEngine";

export type {
  BandChainPerformance,
  ChainPerformanceResult,
  NodePerformance,
} from "@/lib/station/stationChainEngine";

export function useChainPerformance(chainId?: string): ChainPerformanceResult {
  const allChains = useStationChains();
  const activeChain = useActiveChain();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const radios = useUserRadios();
  const inlineComponents = useInlineComponents();

  const targetChain = useMemo(
    () =>
      chainId
        ? (allChains.find((chain) => chain.id === chainId) ?? null)
        : activeChain,
    [activeChain, allChains, chainId],
  );

  return useMemo(
    () =>
      computeStationChainPerformance(targetChain, {
        radios,
        antennas,
        feedlines,
        accessories,
        inlineComponents,
      }),
    [
      targetChain,
      radios,
      antennas,
      feedlines,
      accessories,
      inlineComponents,
    ],
  );
}
