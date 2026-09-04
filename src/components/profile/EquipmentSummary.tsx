/**
 * Compact equipment overview for the profile Overview tab.
 * Shows the active station chain (radio, antenna, feedline) rather than
 * the first items in each inventory array.
 */

import { useActiveChain, useStationInventory } from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { EquipmentCardSm } from "@/components/shack/EquipmentCardSm";
import type { EquipmentType } from "@/components/shack/equipmentCardTypes";
import { resolveChainKit } from "@/lib/station/stationIdentity";

export function EquipmentSummary() {
  const isMobile = useIsMobile();
  const chain = useActiveChain();
  const inventory = useStationInventory();
  const kit = resolveChainKit(chain, inventory);

  if (!kit) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Equipment
        </h3>
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">No active signal path</p>
          <p className="text-xs text-gray-600 mt-1">
            Activate a path in the Station Builder Lab.
          </p>
        </div>
      </div>
    );
  }

  const items: Array<{
    key: string;
    title: string;
    subtitle?: string;
    equipmentType: EquipmentType;
    stats?: Array<{ icon: "power" | "length"; label: string; value: string }>;
  }> = [
    {
      key: "radio",
      title: kit.radioLabel,
      subtitle: kit.chainName,
      equipmentType: "radio",
      stats: [
        {
          icon: "power",
          label: "Power",
          value: `${Math.round(kit.powerWatts)}W`,
        },
      ],
    },
    {
      key: "antenna",
      title: kit.antennaLabel,
      subtitle:
        kit.antennaHeightMeters != null
          ? `${kit.antennaHeightMeters}m`
          : kit.antennaType,
      equipmentType: "antenna",
    },
  ];

  if (kit.feedlineLabel) {
    items.push({
      key: "feedline",
      title: kit.feedlineLabel,
      equipmentType: "feedline",
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Equipment
      </h3>
      <p className="text-xs text-gray-500 mb-3">{kit.chainName}</p>
      <div
        className={
          isMobile ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-3 gap-2"
        }
      >
        {items.map((item) => (
          <EquipmentCardSm
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            equipmentType={item.equipmentType}
            stats={item.stats}
          />
        ))}
      </div>
    </div>
  );
}
