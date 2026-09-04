import { getSupabase } from "@/lib/supabase";
import type { Json } from "@/types/supabase";

/**
 * Writes the public shack summary into profiles.stats_cache.equipment.
 * Loaded only on profile push so station/chain math stays out of the app entry.
 */
export async function pushPublicEquipmentCache(
  userId: string,
  existingCache: Record<string, unknown>,
): Promise<void> {
  const { getStationInventory, useShackStore } = await import(
    "@/stores/shackStore"
  );
  const [
    { computeStationChainPerformance },
    { buildPublicEquipmentSummary, resolveChainKit },
  ] = await Promise.all([
    import("@/lib/station/stationChainEngine"),
    import("@/lib/station/stationIdentity"),
  ]);

  const shack = useShackStore.getState();
  const inventory = getStationInventory();
  const activeChain = shack.activeChainId
    ? (shack.stationChains.find((chain) => chain.id === shack.activeChainId) ??
      null)
    : null;
  const kit = resolveChainKit(activeChain, inventory);
  const chainPerf = computeStationChainPerformance(activeChain, inventory);
  const supabase = getSupabase();
  const { error: cacheError } = await supabase
    .from("profiles")
    .update({
      stats_cache: {
        ...existingCache,
        equipment: buildPublicEquipmentSummary(kit, chainPerf.bands),
      } as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (cacheError) {
    throw new Error(`Profile equipment cache failed: ${cacheError.message}`);
  }
}
