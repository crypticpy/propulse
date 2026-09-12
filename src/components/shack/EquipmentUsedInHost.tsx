import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthStore } from "@/stores/authStore";
import { useShackStore } from "@/stores/shackStore";
import {
  collectLegacyInventorySnapshot,
  queryEquipmentUsedInFromLegacy,
  type EquipmentUsedInViewModel,
} from "@/lib/station/workbench/equipment/inventoryQuery";
import { EquipmentUsedInDialog } from "@/components/shack/EquipmentUsedInDialog";
import {
  EquipmentUsedInContext,
  type EquipmentUsedInRequest,
} from "@/components/shack/EquipmentUsedInContext";

export function EquipmentUsedInHost({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<EquipmentUsedInRequest | null>(null);
  const ownerId = useAuthStore((state) => state.user?.id ?? "");

  const view: EquipmentUsedInViewModel | null = useMemo(() => {
    if (!request || !ownerId) return null;
    const state = useShackStore.getState();
    const snapshot = collectLegacyInventorySnapshot({
      radios: state.radios,
      customRadios: state.customRadios,
      antennas: state.antennas,
      feedlines: state.feedlines,
      accessories: state.accessories,
      inlineComponents: state.inlineComponents,
      stationChains: state.stationChains,
      activeChainId: state.activeChainId,
    });
    try {
      return queryEquipmentUsedInFromLegacy(
        snapshot,
        ownerId,
        request.instanceId,
        new Date().toISOString(),
      );
    } catch {
      return null;
    }
  }, [ownerId, request]);

  const openUsedIn = useCallback((next: EquipmentUsedInRequest) => {
    setRequest(next);
  }, []);

  const contextValue = useMemo(() => ({ openUsedIn }), [openUsedIn]);

  return (
    <EquipmentUsedInContext.Provider value={contextValue}>
      {children}
      <EquipmentUsedInDialog
        open={request !== null}
        onClose={() => setRequest(null)}
        view={request ? view : null}
      />
    </EquipmentUsedInContext.Provider>
  );
}
