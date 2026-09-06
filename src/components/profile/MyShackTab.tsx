/**
 * MyShackTab -- Equipment inventory tab for the operator profile.
 *
 * Displays all user equipment grouped by type (Radios, Antennas, Feedlines,
 * Accessories) using the shared EquipmentCardSm component. Shows an empty
 * state with a link to the Shack Builder when no equipment is configured.
 */

import { Link } from "react-router-dom";
import {
  useActiveChain,
  useShackStore,
  useStationInventory,
  useUserRadios,
} from "@/stores/shackStore";
import { resolveChainKit } from "@/lib/station/stationIdentity";
import {
  EquipmentGlyph,
  EmptyState,
  Badge,
  Section,
  StationProvider,
  Surface,
} from "@/components/station-ui";
import { EquipmentInventoryRow } from "./EquipmentInventoryRow";
import { INLINE_COMPONENT_LABELS } from "@/types/shack";
import "./my-shack-tab.css";
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
  const inlineComponents = useShackStore((s) => s.inlineComponents);
  const chain = useActiveChain();
  const inventory = useStationInventory();
  const kit = resolveChainKit(chain, inventory);

  const hasEquipment =
    userRadios.length > 0 ||
    antennas.length > 0 ||
    feedlines.length > 0 ||
    accessories.length > 0 ||
    inlineComponents.length > 0;

  // ── Empty State ──────────────────────────────────────────────────────────

  if (!hasEquipment) {
    return (
      <StationProvider className={`profile-shack-inventory ${className ?? ""}`}>
        <Surface>
          <EmptyState
            title="Every station starts somewhere"
            icon={<EquipmentGlyph kind="radio" width={120} />}
            action={
              <Link
                to="/shack?view=equipment"
                className="su-button su-button--primary"
              >
                Add your first piece of gear
              </Link>
            }
          >
            Catalog radios, homebrew antennas and the cables between them all
            have a place in your shack.
          </EmptyState>
        </Surface>
      </StationProvider>
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

  if (inlineComponents.length > 0) {
    sections.push({
      key: "inline",
      label: "Inline components",
      items: inlineComponents.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: INLINE_COMPONENT_LABELS[item.componentType],
        equipmentType: "inline",
        imageId: item.imageId,
      })),
    });
  }

  return (
    <StationProvider className={`profile-shack-inventory ${className ?? ""}`}>
      <Section
        title="My station"
        description="The equipment behind your operating story."
        actions={
          <Link to="/shack" className="su-button su-button--primary">
            Open workbench
          </Link>
        }
      >
        {kit && (
          <Surface className="profile-shack-path">
            <Badge tone="info">Using in ProPulse</Badge>
            <strong>{kit.chainName}</strong>
            <p className="su-hint">
              {kit.radioLabel} · {kit.antennaLabel}
              {kit.powerWatts ? ` · ${Math.round(kit.powerWatts)} W` : ""}
            </p>
          </Surface>
        )}
        <div className="su-stack">
          {sections.map((section) => (
            <section
              key={section.key}
              aria-labelledby={`my-shack-${section.key}`}
            >
              <div className="profile-shack-group-heading">
                <h3 id={`my-shack-${section.key}`}>{section.label}</h3>
                <Badge>{section.items.length}</Badge>
              </div>
              <ul className="profile-shack-list">
                {section.items.map((item) => (
                  <EquipmentInventoryRow key={item.id} {...item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <Link
          to="/shack?view=equipment"
          className="su-button su-button--secondary profile-shack-manage"
        >
          Manage all equipment
        </Link>
      </Section>
    </StationProvider>
  );
}
