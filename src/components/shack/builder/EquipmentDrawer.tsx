/**
 * EquipmentDrawer — Tabbed equipment inventory panel for the signal chain builder.
 *
 * Shows all user equipment grouped by type (Radios, Antennas, Feedlines,
 * Accessories, Inline) with draggable cards. Signal-path accessories only.
 */

import { useState, useMemo, useCallback } from "react";
import type { StationChain } from "@/types/stationChain";
import { isSignalPathCategory } from "@/types/stationChain";
import {
  ANTENNA_TYPE_LABELS,
  FEEDLINE_TYPE_LABELS,
  ACCESSORY_CATEGORY_LABELS,
  INLINE_COMPONENT_LABELS,
} from "@/types/shack";
import {
  useUserRadios,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
  useInlineComponents,
} from "@/stores/shackStore";
import {
  DraggableEquipmentCard,
  type EquipmentCardType,
} from "./DraggableEquipmentCard";

// ─── Types ──────────────────────────────────────────────────────────────────

type DrawerTab =
  | "radios"
  | "antennas"
  | "feedlines"
  | "accessories"
  | "shack"
  | "inline";

interface EquipmentDrawerProps {
  /** Callback to notify parent that a drag operation started/ended from the drawer */
  onDragActiveChange?: (isDragging: boolean) => void;
  /** The active chain — used to mark equipment that's in use */
  activeChain: StationChain | null;
}

const TAB_DEFS: { key: DrawerTab; label: string }[] = [
  { key: "radios", label: "Radios" },
  { key: "antennas", label: "Antennas" },
  { key: "feedlines", label: "Feedlines" },
  { key: "accessories", label: "Accessories" },
  { key: "shack", label: "Shack Gear" },
  { key: "inline", label: "Inline" },
];

// ─── In-Use Detection ───────────────────────────────────────────────────────

function buildInUseSet(chain: StationChain | null) {
  const inUse = new Set<string>();
  if (!chain) return inUse;

  for (const node of chain.nodes) {
    switch (node.type) {
      case "radio":
        inUse.add(`radio:${node.radioId}`);
        break;
      case "antenna":
        inUse.add(`antenna:${node.antennaId}`);
        break;
      case "accessory":
        inUse.add(`accessory:${node.accessoryId}`);
        break;
      case "feedline_run": {
        const run = chain.feedlineRuns.find((r) => r.id === node.feedlineRunId);
        if (run) {
          inUse.add(`feedline:${run.feedlineId}`);
          for (const cid of run.inlineComponentIds) {
            inUse.add(`inline:${cid}`);
          }
        }
        break;
      }
    }
  }

  return inUse;
}

// ─── Empty State ────────────────────────────────────────────────────────────

const EMPTY_SHORT: Record<DrawerTab, string> = {
  radios: "No radios added yet.",
  antennas: "No antennas added yet.",
  feedlines: "No feedlines added yet.",
  accessories: "No signal-path accessories added yet.",
  shack: "No shack gear added yet.",
  inline: "No inline components added yet.",
};

function EmptyState({ tab }: { tab: DrawerTab }) {
  return (
    <div className="text-center py-6 px-4 space-y-1.5">
      <p className="text-xs text-gray-500 italic">{EMPTY_SHORT[tab]}</p>
      <button
        className="text-plasma-orange hover:text-plasma-orange/80 underline text-xs"
        onClick={() => {
          // Navigate to the appropriate inventory tab in ShackPage
          // The ShackPage hash navigation uses #radios, #antennas, etc.
          const tabMap: Record<DrawerTab, string> = {
            radios: "radios",
            antennas: "antennas",
            feedlines: "feedlines",
            accessories: "accessories",
            shack: "accessories",
            inline: "inline",
          };
          window.location.hash = tabMap[tab];
        }}
      >
        Add in Inventory
      </button>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EquipmentDrawer({
  onDragActiveChange,
  activeChain,
}: EquipmentDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("radios");
  const [searchQuery, setSearchQuery] = useState("");

  // Store hooks
  const userRadios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineComponents = useInlineComponents();

  // Signal-path accessories only
  const signalPathAccessories = useMemo(
    () => accessories.filter((a) => isSignalPathCategory(a.category)),
    [accessories],
  );

  // Non-signal-path accessories (shack gear)
  const shackAccessories = useMemo(
    () => accessories.filter((a) => !isSignalPathCategory(a.category)),
    [accessories],
  );

  // Build in-use set for the active chain
  const inUseSet = useMemo(() => buildInUseSet(activeChain), [activeChain]);

  // Tab labels with dynamic counts
  const tabs = useMemo(() => {
    const counts: Record<DrawerTab, number> = {
      radios: userRadios.length,
      antennas: antennas.length,
      feedlines: feedlines.length,
      accessories: signalPathAccessories.length,
      shack: shackAccessories.length,
      inline: inlineComponents.length,
    };
    return TAB_DEFS.map((tab) => ({
      ...tab,
      label:
        counts[tab.key] > 0 ? `${tab.label} (${counts[tab.key]})` : tab.label,
    }));
  }, [
    userRadios.length,
    antennas.length,
    feedlines.length,
    signalPathAccessories.length,
    shackAccessories.length,
    inlineComponents.length,
  ]);

  // Drag callbacks
  const handleDragStart = useCallback(() => {
    onDragActiveChange?.(true);
  }, [onDragActiveChange]);

  const handleDragEnd = useCallback(() => {
    onDragActiveChange?.(false);
  }, [onDragActiveChange]);

  // ─── Search filter helper ───────────────────────────────────────────────

  const matchesSearch = useCallback(
    (name: string, subLabel?: string) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        name.toLowerCase().includes(q) ||
        (subLabel != null && subLabel.toLowerCase().includes(q))
      );
    },
    [searchQuery],
  );

  // ─── Card renderer helper ───────────────────────────────────────────────

  function renderCard(
    id: string,
    type: EquipmentCardType,
    name: string,
    subLabel?: string,
  ) {
    return (
      <DraggableEquipmentCard
        key={id}
        id={id}
        type={type}
        name={name}
        subLabel={subLabel}
        inUse={inUseSet.has(`${type}:${id}`)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    );
  }

  // ─── Tab content ────────────────────────────────────────────────────────

  function renderTabContent() {
    switch (activeTab) {
      case "radios": {
        if (userRadios.length === 0) return <EmptyState tab="radios" />;
        const filteredRadios = userRadios.filter(({ userRadio, equipment }) => {
          const rName =
            equipment?.displayName ??
            (equipment
              ? `${equipment.manufacturer} ${equipment.model}`
              : (userRadio.nickname ?? "Unknown Radio"));
          return matchesSearch(rName, equipment?.manufacturer);
        });
        if (filteredRadios.length === 0)
          return (
            <p className="text-xs text-gray-500 italic text-center py-4">
              No matches
            </p>
          );
        return (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredRadios.map(({ userRadio, equipment }) => {
              const name =
                equipment?.displayName ??
                (equipment
                  ? `${equipment.manufacturer} ${equipment.model}`
                  : (userRadio.nickname ?? "Unknown Radio"));
              const subLabel = equipment?.manufacturer;
              return renderCard(userRadio.id, "radio", name, subLabel);
            })}
          </div>
        );
      }

      case "antennas": {
        if (antennas.length === 0) return <EmptyState tab="antennas" />;
        const filteredAntennas = antennas.filter((a) =>
          matchesSearch(a.name, ANTENNA_TYPE_LABELS[a.antennaType]),
        );
        if (filteredAntennas.length === 0)
          return (
            <p className="text-xs text-gray-500 italic text-center py-4">
              No matches
            </p>
          );
        return (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredAntennas.map((antenna) =>
              renderCard(
                antenna.id,
                "antenna",
                antenna.name,
                ANTENNA_TYPE_LABELS[antenna.antennaType],
              ),
            )}
          </div>
        );
      }

      case "feedlines": {
        if (feedlines.length === 0) return <EmptyState tab="feedlines" />;
        const filteredFeedlines = feedlines.filter((f) =>
          matchesSearch(
            f.name,
            `${FEEDLINE_TYPE_LABELS[f.feedlineType]}, ${f.lengthFeet} ft`,
          ),
        );
        if (filteredFeedlines.length === 0)
          return (
            <p className="text-xs text-gray-500 italic text-center py-4">
              No matches
            </p>
          );
        return (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredFeedlines.map((feedline) =>
              renderCard(
                feedline.id,
                "feedline",
                feedline.name,
                `${FEEDLINE_TYPE_LABELS[feedline.feedlineType]}, ${feedline.lengthFeet} ft`,
              ),
            )}
          </div>
        );
      }

      case "accessories": {
        if (signalPathAccessories.length === 0)
          return <EmptyState tab="accessories" />;
        const filteredAccessories = signalPathAccessories.filter((a) =>
          matchesSearch(a.name, ACCESSORY_CATEGORY_LABELS[a.category]),
        );
        if (filteredAccessories.length === 0)
          return (
            <p className="text-xs text-gray-500 italic text-center py-4">
              No matches
            </p>
          );
        return (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredAccessories.map((accessory) =>
              renderCard(
                accessory.id,
                "accessory",
                accessory.name,
                ACCESSORY_CATEGORY_LABELS[accessory.category],
              ),
            )}
          </div>
        );
      }

      case "shack": {
        if (shackAccessories.length === 0) return <EmptyState tab="shack" />;
        const filteredShack = shackAccessories.filter((a) =>
          matchesSearch(a.name, ACCESSORY_CATEGORY_LABELS[a.category]),
        );
        if (filteredShack.length === 0)
          return (
            <p className="text-xs text-gray-500 italic text-center py-4">
              No matches
            </p>
          );
        return (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredShack.map((accessory) =>
              renderCard(
                accessory.id,
                "shack_accessory",
                accessory.name,
                ACCESSORY_CATEGORY_LABELS[accessory.category],
              ),
            )}
          </div>
        );
      }

      case "inline": {
        if (inlineComponents.length === 0) return <EmptyState tab="inline" />;
        const filteredInline = inlineComponents.filter((c) =>
          matchesSearch(
            c.name,
            `${INLINE_COMPONENT_LABELS[c.componentType]}, ${c.insertionLossDb} dB`,
          ),
        );
        if (filteredInline.length === 0)
          return (
            <p className="text-xs text-gray-500 italic text-center py-4">
              No matches
            </p>
          );
        return (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredInline.map((component) =>
              renderCard(
                component.id,
                "inline",
                component.name,
                `${INLINE_COMPONENT_LABELS[component.componentType]}, ${component.insertionLossDb} dB`,
              ),
            )}
          </div>
        );
      }
    }
  }

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl flex flex-col overflow-hidden">
      {/* Instructional header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Your Equipment
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-gray-500">
          {/* Upward arrow hint */}
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
          <span className="text-[10px] font-medium">Drag to canvas</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-2 pb-2 pt-1 overflow-x-auto scrollbar-hide">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              setSearchQuery("");
            }}
            className={`
              shrink-0 px-3 py-1.5 rounded-full text-xs font-medium
              transition-colors duration-150
              ${
                activeTab === key
                  ? "bg-plasma-orange text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300"
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search filter */}
      <div className="px-2 pb-1.5">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter equipment..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-plasma-orange/40"
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-2 pt-0 max-h-80">
        {renderTabContent()}
      </div>
    </div>
  );
}
