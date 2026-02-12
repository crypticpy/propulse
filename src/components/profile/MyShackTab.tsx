/**
 * MyShackTab -- Equipment inventory tab for the operator profile.
 *
 * Displays all user equipment grouped by type (Radios, Antennas, Feedlines,
 * Accessories) using the shared EquipmentCardSm component. Shows an empty
 * state with a link to the Shack Builder when no equipment is configured.
 */

import { Link } from "react-router-dom";
import { useShackStore, useUserRadios } from "@/stores/shackStore";
import { EquipmentCardSm } from "@/components/shack/EquipmentCardSm";
import type { EquipmentType } from "@/components/shack/equipmentCardTypes";
import { ANTENNA_TYPE_LABELS } from "@/types/shack";
import { FEEDLINE_TYPE_LABELS } from "@/types/shack";
import { ACCESSORY_CATEGORY_LABELS } from "@/types/shack";

// ─── Props ──────────────────────────────────────────────────────────────────

interface MyShackTabProps {
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MyShackTab({ className }: MyShackTabProps) {
  const userRadios = useUserRadios();
  const antennas = useShackStore((s) => s.antennas);
  const feedlines = useShackStore((s) => s.feedlines);
  const accessories = useShackStore((s) => s.accessories);

  const hasEquipment =
    userRadios.length > 0 ||
    antennas.length > 0 ||
    feedlines.length > 0 ||
    accessories.length > 0;

  // ── Empty State ──────────────────────────────────────────────────────────

  if (!hasEquipment) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-400 mb-1">No equipment configured</p>
          <p className="text-xs text-gray-500 mb-4">
            Add equipment in the Shack Builder to see your station here.
          </p>
          <Link
            to="/shack"
            className="px-4 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-colors"
          >
            Open Shack Builder
          </Link>
        </div>
      </div>
    );
  }

  // ── Equipment Sections ───────────────────────────────────────────────────

  const sections: Array<{
    key: string;
    label: string;
    items: Array<{
      id: string;
      title: string;
      subtitle?: string;
      equipmentType: EquipmentType;
      stats?: Array<{ icon: "power" | "length"; label: string; value: string }>;
      imageId?: string;
    }>;
  }> = [];

  // Radios
  if (userRadios.length > 0) {
    sections.push({
      key: "radios",
      label: "Radios",
      items: userRadios.map(({ userRadio, equipment }) => ({
        id: userRadio.id,
        title:
          userRadio.nickname ??
          equipment?.displayName ??
          (equipment
            ? `${equipment.manufacturer} ${equipment.model}`
            : "Unknown Radio"),
        subtitle: equipment?.manufacturer,
        equipmentType: "radio" as EquipmentType,
        stats: equipment
          ? [
              {
                icon: "power" as const,
                label: "Power",
                value: `${equipment.maxPower}W`,
              },
            ]
          : undefined,
        imageId: userRadio.imageId,
      })),
    });
  }

  // Antennas
  if (antennas.length > 0) {
    sections.push({
      key: "antennas",
      label: "Antennas",
      items: antennas.map((ant) => ({
        id: ant.id,
        title: ant.name,
        subtitle: `${ant.heightMeters}m ${ANTENNA_TYPE_LABELS[ant.antennaType] ?? ant.antennaType}`,
        equipmentType: "antenna" as EquipmentType,
        imageId: ant.imageId,
      })),
    });
  }

  // Feedlines
  if (feedlines.length > 0) {
    sections.push({
      key: "feedlines",
      label: "Feedlines",
      items: feedlines.map((fl) => ({
        id: fl.id,
        title: fl.name,
        subtitle: `${FEEDLINE_TYPE_LABELS[fl.feedlineType] ?? fl.feedlineType}`,
        equipmentType: "feedline" as EquipmentType,
        stats: [
          {
            icon: "length" as const,
            label: "Length",
            value: `${fl.lengthFeet}ft`,
          },
        ],
        imageId: fl.imageId,
      })),
    });
  }

  // Accessories
  if (accessories.length > 0) {
    sections.push({
      key: "accessories",
      label: "Accessories",
      items: accessories.map((acc) => ({
        id: acc.id,
        title: acc.name,
        subtitle: ACCESSORY_CATEGORY_LABELS[acc.category] ?? acc.category,
        equipmentType: "accessory" as EquipmentType,
        imageId: acc.imageId,
      })),
    });
  }

  return (
    <div className={className}>
      {/* Shack Builder link */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          My Station
        </h3>
        <Link
          to="/shack"
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          View full station in Shack Builder &rarr;
        </Link>
      </div>

      {/* Equipment sections */}
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.key}>
            <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              {section.label}
              <span className="ml-1.5 text-gray-600">
                ({section.items.length})
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {section.items.map((item) => (
                <EquipmentCardSm
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  equipmentType={item.equipmentType}
                  stats={item.stats}
                  imageId={item.imageId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
