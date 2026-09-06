/**
 * AddEquipmentPanel -- HTML panel for adding equipment at a specific position
 * in the signal chain.
 *
 * Appears below the BuilderCanvas when the user clicks a "+" drop zone.
 * Two-step flow: pick equipment type, then pick a specific item from inventory.
 */

import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button, Section, Surface, TextField } from "@/components/station-ui";
import "./equipment-workbench.css";
import type { EquipmentTypeOption } from "@/lib/chainOrdering";
import type { AccessoryCategory } from "@/types/shack";
import {
  ANTENNA_TYPE_LABELS,
  FEEDLINE_TYPE_LABELS,
  ACCESSORY_CATEGORY_LABELS,
} from "@/types/shack";
import { isSignalPathCategory } from "@/types/stationChain";
import {
  useUserRadios,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
  useStationChains,
} from "@/stores/shackStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AddEquipmentPanelProps {
  /** Position in the chain where the new node will be inserted */
  position: number;
  /** Toolbar placement follows signal order; explicit gaps retain their position. */
  automaticPlacement?: boolean;
  /** Valid equipment type options for this position (from getValidEquipmentTypes) */
  validTypes: EquipmentTypeOption[];
  /** Called when user selects equipment to add */
  onAdd: (nodeType: string, equipmentId: string) => void;
  /** Called when user cancels / closes the panel */
  onCancel: () => void;
}

// ─── Type Icons ─────────────────────────────────────────────────────────────

function RadioIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function AmplifierIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      />
    </svg>
  );
}

function TunerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
      />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
      />
    </svg>
  );
}

function SwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

function FeedlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"
      />
    </svg>
  );
}

function AntennaIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.115 5.19l.319 1.913A6 6 0 008.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 002.288-4.042 1.087 1.087 0 00-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 01-.98-.314l-.295-.295a1.125 1.125 0 010-1.591L13.5 7.5l1.5-1.5-3-3-5.885 2.19z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 3L22 7.5l-2.5 2.5"
      />
    </svg>
  );
}

const TYPE_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  radio: RadioIcon,
  amplifier: AmplifierIcon,
  tuner: TunerIcon,
  filter: FilterIcon,
  switch: SwitchIcon,
  feedline: FeedlineIcon,
  antenna: AntennaIcon,
};

// ─── In-Use Detection (across ALL chains) ───────────────────────────────────

function buildGlobalInUseSet(
  chains: Array<{
    nodes: Array<{
      type: string;
      radioId?: string;
      antennaId?: string;
      accessoryId?: string;
      feedlineRunId?: string;
    }>;
    feedlineRuns: Array<{ id: string; feedlineId: string }>;
  }>,
) {
  const inUse = new Set<string>();
  for (const chain of chains) {
    for (const node of chain.nodes) {
      switch (node.type) {
        case "radio":
          if (node.radioId) inUse.add(`radio:${node.radioId}`);
          break;
        case "antenna":
          if (node.antennaId) inUse.add(`antenna:${node.antennaId}`);
          break;
        case "accessory":
          if (node.accessoryId) inUse.add(`accessory:${node.accessoryId}`);
          break;
        case "feedline_run": {
          const run = chain.feedlineRuns.find(
            (r: { id: string }) => r.id === node.feedlineRunId,
          );
          if (run) inUse.add(`feedline:${run.feedlineId}`);
          break;
        }
      }
    }
  }
  return inUse;
}

// ─── Inventory Item Interface ───────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  subLabel?: string;
  inUse: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AddEquipmentPanel({
  position,
  automaticPlacement = false,
  validTypes,
  onAdd,
  onCancel,
}: AddEquipmentPanelProps) {
  const [selectedType, setSelectedType] = useState<EquipmentTypeOption | null>(
    null,
  );

  const [search, setSearch] = useState("");

  // ── Store hooks ─────────────────────────────────────────────────────────
  const userRadios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const allChains = useStationChains();

  // ── In-use set across ALL chains ────────────────────────────────────────
  const inUseSet = useMemo(() => buildGlobalInUseSet(allChains), [allChains]);

  // ── Count inventory by type key ─────────────────────────────────────────
  const inventoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts["radio"] = userRadios.length;
    counts["antenna"] = antennas.length;
    counts["feedline"] = feedlines.length;

    // Signal-path accessories by category
    const signalPathAccessories = accessories.filter((a) =>
      isSignalPathCategory(a.category),
    );
    counts["amplifier"] = signalPathAccessories.filter(
      (a) => a.category === "amplifier",
    ).length;
    counts["tuner"] = signalPathAccessories.filter(
      (a) => a.category === "tuner",
    ).length;
    counts["filter"] = signalPathAccessories.filter(
      (a) => a.category === "filter",
    ).length;
    counts["switch"] = signalPathAccessories.filter(
      (a) => a.category === "switch",
    ).length;

    return counts;
  }, [userRadios, antennas, feedlines, accessories]);

  // ── Build valid-type set for quick lookup ────────────────────────────────
  const validTypeKeys = useMemo(
    () => new Set(validTypes.map((t) => t.inventoryKey)),
    [validTypes],
  );

  // ── All possible types for the buttons (from chainOrdering) ─────────────
  const allTypeOptions: EquipmentTypeOption[] = useMemo(() => {
    // Combine validTypes with invalid types to show all buttons (some disabled)
    const ALL_KEYS = [
      "radio",
      "amplifier",
      "tuner",
      "filter",
      "switch",
      "feedline",
      "antenna",
    ];
    const map = new Map<string, EquipmentTypeOption>();
    for (const t of validTypes) {
      map.set(t.inventoryKey, t);
    }
    // Fill in missing types with placeholder options (for display only)
    const LABELS: Record<string, string> = {
      radio: "Radio",
      amplifier: "Amplifier",
      tuner: "Tuner",
      filter: "Filter",
      switch: "Switch",
      feedline: "Feedline",
      antenna: "Antenna",
    };
    for (const key of ALL_KEYS) {
      if (!map.has(key)) {
        map.set(key, {
          nodeType:
            key === "radio"
              ? "radio"
              : key === "antenna"
                ? "antenna"
                : key === "feedline"
                  ? "feedline_run"
                  : "accessory",
          accessoryCategory: [
            "amplifier",
            "tuner",
            "filter",
            "switch",
          ].includes(key)
            ? (key as AccessoryCategory)
            : undefined,
          label: LABELS[key] ?? key,
          rank: 0,
          inventoryKey: key,
          color: "#888",
        });
      }
    }
    return ALL_KEYS.map((k) => map.get(k)!);
  }, [validTypes]);

  // ── Resolve inventory items for the selected type ───────────────────────
  const getItemsForType = useCallback(
    (option: EquipmentTypeOption): InventoryItem[] => {
      switch (option.inventoryKey) {
        case "radio":
          return userRadios.map(({ userRadio, equipment }) => ({
            id: userRadio.id,
            name:
              equipment?.displayName ??
              (equipment
                ? `${equipment.manufacturer} ${equipment.model}`
                : (userRadio.nickname ?? "Unknown Radio")),
            subLabel: equipment?.manufacturer,
            inUse: inUseSet.has(`radio:${userRadio.id}`),
          }));

        case "antenna":
          return antennas.map((a) => ({
            id: a.id,
            name: a.name,
            subLabel: ANTENNA_TYPE_LABELS[a.antennaType],
            inUse: inUseSet.has(`antenna:${a.id}`),
          }));

        case "feedline":
          return feedlines.map((f) => ({
            id: f.id,
            name: f.name,
            subLabel: `${FEEDLINE_TYPE_LABELS[f.feedlineType]}, ${f.lengthFeet} ft`,
            inUse: inUseSet.has(`feedline:${f.id}`),
          }));

        case "amplifier":
        case "tuner":
        case "filter":
        case "switch": {
          const cat = option.inventoryKey as AccessoryCategory;
          return accessories
            .filter((a) => a.category === cat)
            .map((a) => ({
              id: a.id,
              name: a.name,
              subLabel: ACCESSORY_CATEGORY_LABELS[a.category],
              inUse: inUseSet.has(`accessory:${a.id}`),
            }));
        }

        default:
          return [];
      }
    },
    [userRadios, antennas, feedlines, accessories, inUseSet],
  );

  // ── Determine the nodeType string for onAdd callback ────────────────────
  const resolveNodeType = useCallback((option: EquipmentTypeOption): string => {
    if (option.nodeType === "feedline_run") return "feedline";
    if (option.nodeType === "accessory") return "accessory";
    return option.nodeType;
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleTypeSelect = useCallback((option: EquipmentTypeOption) => {
    setSelectedType(option);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedType(null);
  }, []);

  const handleAdd = useCallback(
    (option: EquipmentTypeOption, itemId: string) => {
      onAdd(resolveNodeType(option), itemId);
    },
    [onAdd, resolveNodeType],
  );

  const inventoryCategory = (key: string) =>
    ["amplifier", "tuner", "filter", "switch"].includes(key)
      ? "accessories"
      : key === "radio"
        ? "radios"
        : key === "antenna"
          ? "antennas"
          : "feedlines";

  if (selectedType) {
    const items = getItemsForType(selectedType);
    const filtered = items.filter((item) =>
      `${item.name} ${item.subLabel ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
    return (
      <Surface className="equipment-picker">
        <Section
          title={`Choose ${selectedType.label.toLowerCase()}`}
          description={
            automaticPlacement
              ? "Step 2 of 2 · Equipment will be placed in signal order."
              : `Step 2 of 2 · Insert at position ${position + 1} in this signal path.`
          }
          actions={
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          }
        >
          <div className="su-stack">
            <div>
              <Button
                variant="quiet"
                onClick={() => {
                  handleBack();
                  setSearch("");
                }}
              >
                ← Equipment types
              </Button>
            </div>
            <TextField
              label={`Find ${selectedType.label.toLowerCase()} in your inventory`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or model"
            />
            {filtered.length > 0 ? (
              <div className="equipment-picker-list">
                {filtered.map((item) => (
                  <div key={item.id} className="equipment-picker-row">
                    <div className="min-w-0">
                      <h3>{item.name}</h3>
                      {item.subLabel && (
                        <p className="su-hint">{item.subLabel}</p>
                      )}
                      {item.inUse && (
                        <p className="su-hint">Also used in a signal path</p>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      aria-label={`Add ${item.name} to path`}
                      onClick={() => handleAdd(selectedType, item.id)}
                    >
                      Add to path
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="equipment-picker-empty">
                <h3>
                  {items.length
                    ? "No matching equipment"
                    : `No ${selectedType.label.toLowerCase()} in your inventory yet`}
                </h3>
                <p className="su-hint">
                  {items.length
                    ? "Try another name or clear the search."
                    : "Add catalog or custom equipment to your inventory, then connect it here."}
                </p>
                {items.length ? (
                  <Button onClick={() => setSearch("")}>Clear search</Button>
                ) : (
                  <Link
                    className="su-button su-button--secondary"
                    onClick={onCancel}
                    to={`/shack?view=equipment&category=${inventoryCategory(selectedType.inventoryKey)}`}
                  >
                    Open inventory
                  </Link>
                )}
              </div>
            )}
          </div>
        </Section>
      </Surface>
    );
  }

  return (
    <Surface className="equipment-picker">
      <Section
        title="Add to signal path"
        description={
          automaticPlacement
            ? "Step 1 of 2 · Choose equipment for automatic placement in signal order."
            : `Step 1 of 2 · Choose equipment for position ${position + 1}.`
        }
        actions={
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        }
      >
        <div className="equipment-type-grid">
          {allTypeOptions.map((option) => {
            const key = option.inventoryKey;
            const isValid = validTypeKeys.has(key);
            const count = inventoryCounts[key] ?? 0;
            const Icon = TYPE_ICON_MAP[key];
            return (
              <button
                key={key}
                type="button"
                disabled={!isValid}
                className="equipment-type-choice"
                onClick={() => handleTypeSelect(option)}
              >
                {Icon && <Icon className="w-6 h-6" />}
                <strong>{option.label}</strong>{" "}
                <span className="su-hint">
                  {!isValid
                    ? "Not available at this position"
                    : count
                      ? `${count} in inventory`
                      : "Add your first item"}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
    </Surface>
  );
}
