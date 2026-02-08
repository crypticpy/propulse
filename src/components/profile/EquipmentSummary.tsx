/**
 * Compact equipment overview for the profile Overview tab.
 * Shows the active radio, first antenna, and first feedline from shackStore.
 */

import { useShackStore, useUserRadios } from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─── Helpers ────────────────────────────────────────────────────────────────

function EquipmentCard({
  icon,
  label,
  name,
  detail,
}: {
  icon: string;
  label: string;
  name: string;
  detail?: string;
}) {
  return (
    <div className="bg-panel/30 border border-white/5 rounded-lg p-3 flex items-start gap-3 min-w-0">
      <span
        className="text-lg leading-none mt-0.5 flex-shrink-0"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm font-medium text-gray-200 truncate">{name}</p>
        {detail && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{detail}</p>
        )}
      </div>
    </div>
  );
}

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

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Equipment
      </h3>

      <div className={isMobile ? "space-y-2" : "grid grid-cols-3 gap-3"}>
        {radioName && (
          <EquipmentCard
            icon={"\u{1F4FB}"} // radio
            label="Radio"
            name={radioName}
            detail={
              activeEntry?.equipment
                ? `${activeEntry.equipment.maxPower}W`
                : undefined
            }
          />
        )}

        {primaryAntenna && (
          <EquipmentCard
            icon={"\u{1F4E1}"} // satellite antenna
            label="Antenna"
            name={primaryAntenna.name}
            detail={`${primaryAntenna.heightMeters}m ${primaryAntenna.antennaType}`}
          />
        )}

        {primaryFeedline && (
          <EquipmentCard
            icon={"\u{1F50C}"} // electric plug
            label="Feedline"
            name={primaryFeedline.name}
            detail={`${primaryFeedline.lengthFeet}ft ${primaryFeedline.feedlineType}`}
          />
        )}
      </div>
    </div>
  );
}
