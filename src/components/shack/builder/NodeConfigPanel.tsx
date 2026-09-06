/**
 * NodeConfigPanel -- Centered modal showing details for a selected
 * chain node with swap/remove actions.
 *
 * Renders content appropriate to the node type:
 *   Radio       -> name, manufacturer, model, power
 *   Accessory   -> name, category badge, key specs by category
 *   FeedlineRun -> feedline info, connectors, condition, inline components
 *   Antenna     -> name, type, bands, height, gain info
 */

import { useState } from "react";
import { Button, Dialog } from "@/components/station-ui";
import "./equipment-workbench.css";
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
  useShackStore,
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

  const node = chain.nodes[nodeIndex];
  if (!node) return null;
  const label =
    node.type === "radio"
      ? "Radio"
      : node.type === "antenna"
        ? "Antenna"
        : node.type === "feedline_run"
          ? "Feedline"
          : "Accessory";
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${label} in this path`}
      description={`${chain.name} · Position ${nodeIndex + 1}. Review equipment and its connections.`}
      footer={
        <div className="su-inline">
          {onSwapEquipment && (
            <Button onClick={() => onSwapEquipment(nodeIndex)}>
              Swap {label.toLowerCase()}
            </Button>
          )}
          {onRemoveNode && (
            <Button variant="danger" onClick={() => onRemoveNode(nodeIndex)}>
              Remove from path
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="equipment-node-details">
        <p className="su-hint">
          Removing an item from this path keeps it in your equipment inventory.
        </p>
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
    </Dialog>
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
          {equipment && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/10 text-gray-400 ml-2 align-middle">
              Your Inventory
            </span>
          )}
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
        <div className="text-lg font-bold text-gray-100">
          {acc.name}
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/10 text-gray-400 ml-2 align-middle">
            Your Inventory
          </span>
        </div>
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
  const [showInlinePicker, setShowInlinePicker] = useState(false);
  const updateFeedlineRun = useShackStore((s) => s.updateFeedlineRun);

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

  // Available inline components not already in this run
  const availableInlines = inlineComponents.filter(
    (c) => !run.inlineComponentIds.includes(c.id),
  );

  function handleAddInline(componentId: string) {
    updateFeedlineRun(chain.id, run!.id, {
      inlineComponentIds: [...run!.inlineComponentIds, componentId],
    });
    setShowInlinePicker(false);
  }

  function handleRemoveInline(componentId: string) {
    updateFeedlineRun(chain.id, run!.id, {
      inlineComponentIds: run!.inlineComponentIds.filter(
        (id) => id !== componentId,
      ),
    });
  }

  return (
    <dl className="space-y-3">
      <div>
        <div className="text-lg font-bold text-gray-100">
          {feedline.name}
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/10 text-gray-400 ml-2 align-middle">
            Your Inventory
          </span>
        </div>
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
            No inline components — add baluns, chokes, or ferrites here
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-alert-red">
                    -{(comp.insertionLossDb ?? 0).toFixed(1)} dB
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveInline(comp.id)}
                    className="text-gray-500 hover:text-alert-red transition-colors"
                    aria-label={`Remove ${comp.name}`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
              </div>
            ))}
          </dd>
        )}
      </div>

      {/* Add inline component button / picker */}
      {showInlinePicker ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">
              Select component:
            </span>
            <button
              type="button"
              onClick={() => setShowInlinePicker(false)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          {availableInlines.length === 0 ? (
            <div className="text-xs text-gray-500 italic py-2 text-center">
              No available inline components
            </div>
          ) : (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {availableInlines.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => handleAddInline(comp.id)}
                  className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 text-left transition-colors"
                >
                  <div>
                    <div className="text-xs text-gray-200">{comp.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {INLINE_COMPONENT_LABELS[comp.componentType]}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    -{(comp.insertionLossDb ?? 0).toFixed(1)} dB
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInlinePicker(true)}
          className="w-full text-xs text-center py-1.5 rounded-lg border border-dashed border-white/20 text-gray-400 hover:text-gray-300 hover:border-white/30 transition-colors"
        >
          + Add Inline Component
        </button>
      )}

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
        <div className="text-lg font-bold text-gray-100">
          {antenna.name}
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/10 text-gray-400 ml-2 align-middle">
            Your Inventory
          </span>
        </div>
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
