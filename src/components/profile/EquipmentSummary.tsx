/**
 * Compact equipment overview for the profile Overview tab.
 * Shows the active radio, first antenna, and first feedline from shackStore
 * using the shared EquipmentCardSm component.
 */

import { useShackStore, useUserRadios } from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { EquipmentCardSm } from "@/components/shack/EquipmentCardSm";
import type { EquipmentType } from "@/components/shack/equipmentCardTypes";

// ─── Component ──────────────────────────────────────────────────────────────

export function EquipmentSummary() {
  const isMobile = useIsMobile();
  const userRadios = useUserRadios();
  const activeRadioId = useShackStore((s) => s.activeRadioId);
  const antennas = useShackStore((s) => s.antennas);
  const feedlines = useShackStore((s) => s.feedlines);

  // Resolve active radio (or first if none active)
  const activeEntry =
    userRadios.find((r) => r.userRadio.id === activeRadioId) ?? userRadios[0];
  const radioName = activeEntry
    ? (activeEntry.userRadio.nickname ??
      (activeEntry.equipment
        ? (activeEntry.equipment.displayName ??
          `${activeEntry.equipment.manufacturer} ${activeEntry.equipment.model}`)
        : "Unknown Radio"))
    : null;

  const primaryAntenna = antennas[0] ?? null;
  const primaryFeedline = feedlines[0] ?? null;

  const hasEquipment = radioName || primaryAntenna || primaryFeedline;

  if (!hasEquipment) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Equipment
        </h3>
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">No equipment configured</p>
          <p className="text-xs text-gray-600 mt-1">
            Visit the Shack page to add your station equipment.
          </p>
        </div>
      </div>
    );
  }

  // Build card items
  const items: Array<{
    key: string;
    title: string;
    subtitle?: string;
    equipmentType: EquipmentType;
    stats?: Array<{ icon: "power" | "length"; label: string; value: string }>;
  }> = [];

  if (radioName) {
    items.push({
      key: "radio",
      title: radioName,
      subtitle: activeEntry?.equipment?.manufacturer,
      equipmentType: "radio",
      stats: activeEntry?.equipment
        ? [
            {
              icon: "power",
              label: "Power",
              value: `${activeEntry.equipment.maxPower}W`,
            },
          ]
        : undefined,
    });
  }

  if (primaryAntenna) {
    items.push({
      key: "antenna",
      title: primaryAntenna.name,
      subtitle: `${primaryAntenna.heightMeters}m ${primaryAntenna.antennaType}`,
      equipmentType: "antenna",
    });
  }

  if (primaryFeedline) {
    items.push({
      key: "feedline",
      title: primaryFeedline.name,
      subtitle: `${primaryFeedline.lengthFeet}ft ${primaryFeedline.feedlineType}`,
      equipmentType: "feedline",
      stats: [
        {
          icon: "length",
          label: "Length",
          value: `${primaryFeedline.lengthFeet}ft`,
        },
      ],
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Equipment
      </h3>

      <div className={isMobile ? "space-y-2" : "grid grid-cols-3 gap-3"}>
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
