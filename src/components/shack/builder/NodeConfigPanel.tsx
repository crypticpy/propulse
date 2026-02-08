/**
 * NodeConfigPanel -- Slide-in right panel showing details for a selected
 * chain node with swap/remove actions.
 *
 * Renders content appropriate to the node type:
 *   Radio       -> name, manufacturer, model, power
 *   Accessory   -> name, category badge, key specs by category
 *   FeedlineRun -> feedline info, connectors, condition, inline components
 *   Antenna     -> name, type, bands, height, gain info
 */

import { useEffect, useCallback } from "react";
import type { StationChain, FeedlineRun } from "@/types/stationChain";
import {
  ANTENNA_TYPE_LABELS,
  FEEDLINE_TYPE_LABELS,
  CONNECTOR_TYPE_LABELS,
  ACCESSORY_CATEGORY_LABELS,
  INLINE_COMPONENT_LABELS,
} from "@/types/shack";
import type {
  UserAntenna,
  UserFeedline,
  UserAccessory,
  InlineComponent,
} from "@/types/shack";
import type { RadioEquipment } from "@/types/radio";
import {
  useUserRadios,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
  useInlineComponents,
} from "@/stores/shackStore";

// ---- Props -----------------------------------------------------------------

export interface NodeConfigPanelProps {
  chain: StationChain;
  nodeIndex: number;
  onClose: () => void;
  /** Called when user wants to swap this node's equipment */
  onSwapEquipment?: (nodeIndex: number) => void;
  /** Called when user wants to remove this node */
  onRemoveNode?: (nodeIndex: number) => void;
}

// ---- Helpers ---------------------------------------------------------------

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  return `${w.toFixed(1)}W`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs text-gray-500 uppercase tracking-wider">
      {children}
    </dt>
  );
}

function SectionValue({ children }: { children: React.ReactNode }) {
  return <dd className="text-sm text-gray-200 mt-0.5">{children}</dd>;
}

function Badge({
  children,
  color = "bg-white/10 text-gray-300",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${color}`}
    >
      {children}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  const base =
    "w-full text-sm font-medium py-2 px-3 rounded-lg border transition-colors";
  const styles =
    variant === "danger"
      ? "bg-alert-red/10 border-alert-red/20 text-alert-red hover:bg-alert-red/20"
      : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10";
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

// ---- Main Component --------------------------------------------------------

export function NodeConfigPanel({
  chain,
  nodeIndex,
  onClose,
  onSwapEquipment,
  onRemoveNode,
}: NodeConfigPanelProps) {
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineComponents = useInlineComponents();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const node = chain.nodes[nodeIndex];
  if (!node) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 z-50 flex flex-col bg-void-black/95 backdrop-blur-md border-l border-white/10 shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
          Node Details
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Close panel"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {node.type === "radio" && (
          <RadioSection
            radioId={node.radioId}
            radios={radios}
            operatingPower={chain.operatingPowerWatts}
          />
        )}
        {node.type === "accessory" && (
          <AccessorySection
            accessoryId={node.accessoryId}
            accessories={accessories}
          />
        )}
        {node.type === "feedline_run" && (
          <FeedlineRunSection
            feedlineRunId={node.feedlineRunId}
            chain={chain}
            feedlines={feedlines}
            inlineComponents={inlineComponents}
          />
        )}
        {node.type === "antenna" && (
          <AntennaSection antennaId={node.antennaId} antennas={antennas} />
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-white/10 space-y-2">
        {onSwapEquipment && (
          <ActionButton onClick={() => onSwapEquipment(nodeIndex)}>
            {node.type === "radio"
              ? "Swap Radio"
              : node.type === "antenna"
                ? "Swap Antenna"
                : node.type === "feedline_run"
                  ? "Swap Feedline"
                  : "Swap Accessory"}
          </ActionButton>
        )}
        {onRemoveNode && (
          <ActionButton
            variant="danger"
            onClick={() => onRemoveNode(nodeIndex)}
          >
            Remove from Chain
          </ActionButton>
        )}
      </div>
    </div>
  );
}

// ---- Radio Section ---------------------------------------------------------

function RadioSection({
  radioId,
  radios,
  operatingPower,
}: {
  radioId: string;
  radios: Array<{
    userRadio: { id: string; equipmentId: string; nickname?: string };
    equipment: RadioEquipment | undefined;
  }>;
  operatingPower: number;
}) {
  const entry = radios.find((r) => r.userRadio.id === radioId);
  const equipment = entry?.equipment;
  const nickname = entry?.userRadio.nickname;

  return (
    <dl className="space-y-3">
      <div>
        <div className="text-lg font-bold text-gray-100">
          {nickname ||
            equipment?.displayName ||
            `${equipment?.manufacturer ?? ""} ${equipment?.model ?? ""}`.trim() ||
            "Unknown Radio"}
        </div>
        {nickname && equipment && (
          <div className="text-xs text-gray-500 mt-0.5">
            {equipment.manufacturer} {equipment.model}
          </div>
        )}
      </div>

      {equipment?.manufacturer && (
        <div>
          <SectionLabel>Manufacturer</SectionLabel>
          <SectionValue>{equipment.manufacturer}</SectionValue>
        </div>
      )}

      {equipment?.model && (
        <div>
          <SectionLabel>Model</SectionLabel>
          <SectionValue>{equipment.model}</SectionValue>
        </div>
      )}

      <div>
        <SectionLabel>Operating Power</SectionLabel>
        <SectionValue>{formatWatts(operatingPower)}</SectionValue>
      </div>

      {equipment && (
        <div>
          <SectionLabel>Power Range</SectionLabel>
          <SectionValue>
            {formatWatts(equipment.minPower)} -{" "}
            {formatWatts(equipment.maxPower)}
          </SectionValue>
        </div>
      )}

      {equipment?.bands && equipment.bands.length > 0 && (
        <div>
          <SectionLabel>Bands</SectionLabel>
          <div className="flex flex-wrap gap-1 mt-1">
            {equipment.bands.map((band) => (
              <Badge key={band} color="bg-nebula-blue/15 text-nebula-blue">
                {band}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </dl>
  );
}

// ---- Accessory Section -----------------------------------------------------

function AccessorySection({
  accessoryId,
  accessories,
}: {
  accessoryId: string;
  accessories: UserAccessory[];
}) {
  const acc = accessories.find((a) => a.id === accessoryId);
  if (!acc) {
    return <div className="text-sm text-gray-500">Accessory not found</div>;
  }

  return (
    <dl className="space-y-3">
      <div>
        <div className="text-lg font-bold text-gray-100">{acc.name}</div>
        <Badge color="bg-plasma-orange/15 text-plasma-orange">
          {ACCESSORY_CATEGORY_LABELS[acc.category]}
        </Badge>
      </div>

      {acc.manufacturer && (
        <div>
          <SectionLabel>Manufacturer</SectionLabel>
          <SectionValue>{acc.manufacturer}</SectionValue>
        </div>
      )}

      {/* Category-specific specs */}
      {acc.category === "amplifier" && (
        <>
          <div>
            <SectionLabel>Gain</SectionLabel>
            <SectionValue>
              <span className="text-signal-green">
                +{acc.gainDb.toFixed(1)} dB
              </span>
            </SectionValue>
          </div>
          <div>
            <SectionLabel>Max Power</SectionLabel>
            <SectionValue>{formatWatts(acc.maxPowerWatts)}</SectionValue>
          </div>
          {acc.bands && acc.bands.length > 0 && (
            <div>
              <SectionLabel>Bands</SectionLabel>
              <div className="flex flex-wrap gap-1 mt-1">
                {acc.bands.map((band) => (
                  <Badge key={band} color="bg-nebula-blue/15 text-nebula-blue">
                    {band}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {acc.category === "tuner" && (
        <>
          <div>
            <SectionLabel>Type</SectionLabel>
            <SectionValue>
              {acc.type === "automatic" ? "Automatic" : "Manual"}
            </SectionValue>
          </div>
          {acc.insertionLossDb != null && (
            <div>
              <SectionLabel>Insertion Loss</SectionLabel>
              <SectionValue>
                <span className="text-alert-red">
                  -{acc.insertionLossDb.toFixed(1)} dB
                </span>
              </SectionValue>
            </div>
          )}
          <div>
            <SectionLabel>Max Power</SectionLabel>
            <SectionValue>{formatWatts(acc.maxPowerWatts)}</SectionValue>
          </div>
        </>
      )}

      {acc.category === "filter" && (
        <>
          <div>
            <SectionLabel>Filter Type</SectionLabel>
            <SectionValue>
              {acc.filterType
                .replace("_", " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </SectionValue>
          </div>
          <div>
            <SectionLabel>Insertion Loss</SectionLabel>
            <SectionValue>
              <span className="text-alert-red">
                -{acc.insertionLossDb.toFixed(1)} dB
              </span>
            </SectionValue>
          </div>
          {acc.bands && acc.bands.length > 0 && (
            <div>
              <SectionLabel>Bands</SectionLabel>
              <div className="flex flex-wrap gap-1 mt-1">
                {acc.bands.map((band) => (
                  <Badge key={band} color="bg-nebula-blue/15 text-nebula-blue">
                    {band}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {acc.category === "switch" && (
        <>
          <div>
            <SectionLabel>Ports</SectionLabel>
            <SectionValue>{acc.ports}</SectionValue>
          </div>
          <div>
            <SectionLabel>Insertion Loss</SectionLabel>
            <SectionValue>
              <span className="text-alert-red">
                -{acc.insertionLossDb.toFixed(1)} dB
              </span>
            </SectionValue>
          </div>
        </>
      )}

      {acc.notes && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <SectionValue>{acc.notes}</SectionValue>
        </div>
      )}
    </dl>
  );
}

// ---- Feedline Run Section --------------------------------------------------

function FeedlineRunSection({
  feedlineRunId,
  chain,
  feedlines,
  inlineComponents,
}: {
  feedlineRunId: string;
  chain: StationChain;
  feedlines: UserFeedline[];
  inlineComponents: InlineComponent[];
}) {
  const run: FeedlineRun | undefined = chain.feedlineRuns.find(
    (r) => r.id === feedlineRunId,
  );
  if (!run) {
    return <div className="text-sm text-gray-500">Feedline run not found</div>;
  }

  const feedline = feedlines.find((f) => f.id === run.feedlineId);
  if (!feedline) {
    return <div className="text-sm text-gray-500">Feedline not found</div>;
  }

  const conditionColors: Record<string, string> = {
    new: "bg-signal-green/15 text-signal-green",
    good: "bg-signal-green/10 text-signal-green",
    fair: "bg-caution-amber/15 text-caution-amber",
    poor: "bg-alert-red/15 text-alert-red",
  };

  const resolvedInlines = run.inlineComponentIds
    .map((id) => inlineComponents.find((c) => c.id === id))
    .filter((c): c is InlineComponent => c != null);

  return (
    <dl className="space-y-3">
      <div>
        <div className="text-lg font-bold text-gray-100">{feedline.name}</div>
        <Badge>{FEEDLINE_TYPE_LABELS[feedline.feedlineType]}</Badge>
      </div>

      <div>
        <SectionLabel>Length</SectionLabel>
        <SectionValue>{feedline.lengthFeet} ft</SectionValue>
      </div>

      <div>
        <SectionLabel>Near-End Connector</SectionLabel>
        <SectionValue>
          {CONNECTOR_TYPE_LABELS[feedline.connectorType]}
        </SectionValue>
      </div>

      <div>
        <SectionLabel>Far-End Connector</SectionLabel>
        <SectionValue>
          {
            CONNECTOR_TYPE_LABELS[
              feedline.connectorTypeFarEnd ?? feedline.connectorType
            ]
          }
        </SectionValue>
      </div>

      <div>
        <SectionLabel>Condition</SectionLabel>
        <dd className="mt-1">
          <Badge
            color={
              conditionColors[feedline.condition] ?? "bg-white/10 text-gray-300"
            }
          >
            {feedline.condition.charAt(0).toUpperCase() +
              feedline.condition.slice(1)}
          </Badge>
        </dd>
      </div>

      {/* Inline components */}
      <div>
        <SectionLabel>
          Inline Components ({resolvedInlines.length})
        </SectionLabel>
        {resolvedInlines.length === 0 ? (
          <dd className="text-xs text-gray-500 mt-1 italic">
            No inline components
          </dd>
        ) : (
          <dd className="mt-1 space-y-1.5">
            {resolvedInlines.map((comp) => (
              <div
                key={comp.id}
                className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-1.5"
              >
                <div>
                  <div className="text-xs text-gray-200">{comp.name}</div>
                  <div className="text-[10px] text-gray-500">
                    {INLINE_COMPONENT_LABELS[comp.componentType]}
                  </div>
                </div>
                <span className="text-xs text-alert-red">
                  -{(comp.insertionLossDb ?? 0).toFixed(1)} dB
                </span>
              </div>
            ))}
          </dd>
        )}
      </div>

      <button
        type="button"
        onClick={() =>
          console.log("[NodeConfigPanel] Add inline component to run:", run.id)
        }
        className="w-full text-xs text-center py-1.5 rounded-lg border border-dashed border-white/20 text-gray-400 hover:text-gray-300 hover:border-white/30 transition-colors"
      >
        + Add Inline Component
      </button>

      {feedline.notes && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <SectionValue>{feedline.notes}</SectionValue>
        </div>
      )}
    </dl>
  );
}

// ---- Antenna Section -------------------------------------------------------

function AntennaSection({
  antennaId,
  antennas,
}: {
  antennaId: string;
  antennas: UserAntenna[];
}) {
  const antenna = antennas.find((a) => a.id === antennaId);
  if (!antenna) {
    return <div className="text-sm text-gray-500">Antenna not found</div>;
  }

  return (
    <dl className="space-y-3">
      <div>
        <div className="text-lg font-bold text-gray-100">{antenna.name}</div>
        <Badge>{ANTENNA_TYPE_LABELS[antenna.antennaType]}</Badge>
      </div>

      {antenna.bands.length > 0 && (
        <div>
          <SectionLabel>Bands</SectionLabel>
          <div className="flex flex-wrap gap-1 mt-1">
            {antenna.bands.map((band) => (
              <Badge key={band} color="bg-nebula-blue/15 text-nebula-blue">
                {band}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Height</SectionLabel>
        <SectionValue>{antenna.heightMeters} m</SectionValue>
      </div>

      <div>
        <SectionLabel>Polarization</SectionLabel>
        <SectionValue>
          {antenna.polarization.charAt(0).toUpperCase() +
            antenna.polarization.slice(1)}
        </SectionValue>
      </div>

      <div>
        <SectionLabel>Mounting</SectionLabel>
        <SectionValue>
          {antenna.mounting
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())}
        </SectionValue>
      </div>

      {/* Gain info */}
      {antenna.gainDbiOverride &&
        Object.keys(antenna.gainDbiOverride).length > 0 && (
          <div>
            <SectionLabel>Gain Overrides (dBi)</SectionLabel>
            <dd className="mt-1 space-y-0.5">
              {Object.entries(antenna.gainDbiOverride).map(([band, gain]) => (
                <div
                  key={band}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-400">{band}</span>
                  <span className="text-signal-green">
                    +{gain.toFixed(1)} dBi
                  </span>
                </div>
              ))}
            </dd>
          </div>
        )}

      {antenna.isRotatable && (
        <div>
          <SectionLabel>Rotatable</SectionLabel>
          <SectionValue>
            Yes
            {antenna.azimuthDeg != null && ` (${antenna.azimuthDeg}deg)`}
          </SectionValue>
        </div>
      )}

      {antenna.notes && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <SectionValue>{antenna.notes}</SectionValue>
        </div>
      )}
    </dl>
  );
}
