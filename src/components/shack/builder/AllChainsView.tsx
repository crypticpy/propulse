/**
 * AllChainsView -- Vertically-stacked accordion of all station chains.
 *
 * Replaces the single-chain ChainSelector view. Only one chain is expanded at a
 * time (the active chain). Each collapsed card shows a ChainStripPreview; the
 * expanded card shows the full BuilderCanvas + EquipmentDrawer + performance UI.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useShackStore,
  useActiveChain,
  useStationChains,
  useUserAccessories,
} from "@/stores/shackStore";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import {
  Badge,
  Button,
  Dialog,
  Disclosure,
  IconButton,
  Inline,
  Notice,
} from "@/components/station-ui";
import {
  ChevronDown,
  Copy,
  Grid2X2,
  Layers,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { SignalPathList } from "./SignalPathList";
import { addPathEquipment } from "./addPathEquipment";
import type { StationChain } from "@/types/stationChain";
import type { AccessoryCategory } from "@/types/shack";
import {
  ALL_EQUIPMENT_OPTIONS,
  getNodeRank,
  getValidEquipmentTypes,
  validateChain,
} from "@/lib/chainOrdering";
import { AddEquipmentPanel } from "./AddEquipmentPanel";
import { BuilderCanvas } from "./BuilderCanvas";
import { ChainStripPreview } from "./ChainStripPreview";
import { ChainWarningBanner } from "./ChainWarningBanner";
import { EquipmentDrawer } from "./EquipmentDrawer";
import { LossBudgetBar } from "./LossBudgetBar";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { NodeContextMenu } from "./NodeContextMenu";
import { PerformanceSidebar } from "./PerformanceSidebar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ShackSchematicView } from "./ShackSchematicView";
import { createPortal } from "react-dom";

// ---- Props ------------------------------------------------------------------

export interface AllChainsViewProps {
  /** The currently selected band for performance display */
  selectedBand: string;
  onSelectBand: (band: string) => void;
}

// ---- Power preset constants -------------------------------------------------

const POWER_PRESETS = [5, 25, 50, 100, 500, 1500] as const;

// ---- Per-chain expanded body ------------------------------------------------

interface ExpandedChainBodyProps {
  chain: StationChain;
  selectedBand: string;
  onSelectBand: (band: string) => void;
}

function ExpandedChainBody({
  chain,
  selectedBand,
  onSelectBand,
}: ExpandedChainBodyProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [pathView, setPathView] = useState<"canvas" | "list">("canvas");

  // ---- Per-chain local state ------------------------------------------------
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(
    null,
  );
  const [isDraggingFromDrawer, setIsDraggingFromDrawer] = useState(false);
  const [showGroundBus, setShowGroundBus] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "removeNode";
    nodeIndex?: number;
    label?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    nodeIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const [addEquipmentState, setAddEquipmentState] = useState<{
    position: number;
    allTypes?: boolean;
  } | null>(null);
  const [swapState, setSwapState] = useState<{
    nodeIndex: number;
    nodeType: string;
  } | null>(null);

  // ---- Store actions --------------------------------------------------------
  const removeNodeFromChain = useShackStore((s) => s.removeNodeFromChain);
  const swapNodeEquipment = useShackStore((s) => s.swapNodeEquipment);
  const updateChain = useShackStore((s) => s.updateChain);
  const accessories = useUserAccessories();

  // ---- Accessory category lookup --------------------------------------------
  const getAccessoryCategory = useCallback(
    (accessoryId: string): AccessoryCategory | null => {
      const acc = accessories.find((a) => a.id === accessoryId);
      return acc?.category ?? null;
    },
    [accessories],
  );

  // ---- Chain performance ----------------------------------------------------
  const chainPerformance = useChainPerformance(chain.id);

  const availableBands = useMemo(() => {
    const bands = chainPerformance.bands.map((b) => b.band);
    return [...new Set(bands)];
  }, [chainPerformance.bands]);

  const selectedBandPerformance = useMemo(() => {
    return chainPerformance.bands.find((b) => b.band === selectedBand) ?? null;
  }, [chainPerformance.bands, selectedBand]);

  // ---- Chain validation warnings --------------------------------------------
  const chainWarnings = useMemo(() => {
    if (chain.nodes.length === 0) return [];
    return validateChain(chain.nodes, getAccessoryCategory);
  }, [chain, getAccessoryCategory]);

  // ---- Derived state --------------------------------------------------------
  const hasNodes = chain.nodes.length > 0;
  const hasRadio = chain.nodes.some((n) => n.type === "radio");
  const hasAntenna = chain.nodes.some((n) => n.type === "antenna");

  // ---- Drop equipment from drawer -------------------------------------------
  const handleDropEquipment = useCallback(
    (nodeType: string, equipmentId: string, position?: number) => {
      const result = addPathEquipment(
        chain.id,
        nodeType,
        equipmentId,
        position,
      );
      setActionError(result.ok ? null : result.error);
      return result;
    },
    [chain.id],
  );

  // ---- Remove node (with confirmation) --------------------------------------
  const handleRequestRemoveNode = useCallback(
    (nodeIndex: number, nodeName?: string) => {
      setConfirmAction({
        type: "removeNode",
        nodeIndex,
        label: nodeName ?? `Node ${nodeIndex + 1}`,
      });
    },
    [],
  );

  const handleConfirmRemoveNode = useCallback(() => {
    if (confirmAction?.nodeIndex == null) return;
    removeNodeFromChain(chain.id, confirmAction.nodeIndex);
    setSelectedNodeIndex(null);
    setConfirmAction(null);
  }, [chain.id, confirmAction, removeNodeFromChain]);

  // ---- Context menu handlers ------------------------------------------------
  const handleNodeContextMenu = useCallback(
    (nodeIndex: number, x: number, y: number) => {
      setContextMenu({ nodeIndex, x, y });
    },
    [],
  );

  const handleContextConfigure = useCallback(() => {
    if (contextMenu) {
      setAddEquipmentState(null); // close add panel
      setSwapState(null); // close swap panel
      setSelectedNodeIndex(contextMenu.nodeIndex);
      setContextMenu(null);
    }
  }, [contextMenu]);

  const handleContextRemove = useCallback(() => {
    if (!contextMenu) return;
    const node = chain.nodes[contextMenu.nodeIndex];
    const label = node
      ? `this ${node.type === "feedline_run" ? "feedline" : node.type}`
      : "this node";
    setConfirmAction({
      type: "removeNode",
      nodeIndex: contextMenu.nodeIndex,
      label,
    });
    setContextMenu(null);
  }, [contextMenu, chain.nodes]);

  const handleContextMoveLeft = useCallback(() => {
    if (!contextMenu) return;
    const idx = contextMenu.nodeIndex;
    if (idx > 0) {
      const newNodes = [...chain.nodes];
      [newNodes[idx - 1], newNodes[idx]] = [newNodes[idx], newNodes[idx - 1]];
      updateChain(chain.id, { nodes: newNodes });
    }
    setContextMenu(null);
  }, [contextMenu, chain, updateChain]);

  const handleContextMoveRight = useCallback(() => {
    if (!contextMenu) return;
    const idx = contextMenu.nodeIndex;
    if (idx < chain.nodes.length - 1) {
      const newNodes = [...chain.nodes];
      [newNodes[idx], newNodes[idx + 1]] = [newNodes[idx + 1], newNodes[idx]];
      updateChain(chain.id, { nodes: newNodes });
    }
    setContextMenu(null);
  }, [contextMenu, chain, updateChain]);

  // ---- Add equipment panel handler ------------------------------------------
  const handleAddEquipmentAtPosition = useCallback((position: number) => {
    setSwapState(null); // close swap panel
    setSelectedNodeIndex(null); // close config panel
    setActionError(null);
    setAddEquipmentState({ position });
  }, []);

  return (
    <div className="space-y-3">
      <div className="sw-editor-toolbar">
        <div>
          <h3>RF signal path</h3>
          <p className="su-hint">
            {!hasNodes
              ? "Add a radio to begin your path."
              : !hasRadio
                ? "Add a radio to describe the source."
                : !hasAntenna
                  ? "Add an antenna to describe the destination."
                  : "Select equipment to inspect its settings."}
          </p>
        </div>
        <Inline>
          <div
            className="sw-view-switch"
            role="group"
            aria-label="Signal path presentation"
          >
            <Button
              variant="quiet"
              aria-pressed={pathView === "canvas"}
              onClick={() => setPathView("canvas")}
            >
              <Grid2X2 size={17} aria-hidden="true" /> Canvas
            </Button>
            <Button
              variant="quiet"
              aria-pressed={pathView === "list"}
              onClick={() => setPathView("list")}
            >
              <ListOrdered size={17} aria-hidden="true" /> Path list
            </Button>
          </div>
          {hasNodes && pathView === "canvas" && (
            <Button
              aria-pressed={showGroundBus}
              onClick={() => setShowGroundBus((v) => !v)}
            >
              Ground connections
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => {
              setSelectedNodeIndex(null);
              setSwapState(null);
              setActionError(null);
              setAddEquipmentState({
                position: chain.nodes.length,
                allTypes: true,
              });
            }}
          >
            <Plus size={18} aria-hidden="true" /> Add to path
          </Button>
        </Inline>
      </div>

      {actionError && !addEquipmentState && !swapState && (
        <Notice tone="danger" title="Change not saved" live>
          {actionError}
        </Notice>
      )}
      <div className="sw-editing-grid">
        <div className="sw-main-editor">
          {/* Chain validation warnings */}
          {chainWarnings.length > 0 && (
            <ChainWarningBanner warnings={chainWarnings} />
          )}

          {/* Both views edit the same stored path; no separate draft is implied. */}
          <div className="sw-canvas-stage" hidden={pathView !== "canvas"}>
            <BuilderCanvas
              chain={chain}
              selectedNodeIndex={selectedNodeIndex}
              onSelectNode={(idx) => {
                setAddEquipmentState(null);
                setSwapState(null);
                setSelectedNodeIndex(idx);
              }}
              onDropEquipment={handleDropEquipment}
              selectedBand={selectedBand}
              isDraggingFromDrawer={isDraggingFromDrawer}
              showGroundBus={showGroundBus}
              onNodeContextMenu={handleNodeContextMenu}
              onAddEquipmentAtPosition={handleAddEquipmentAtPosition}
            />
            <p className="sw-canvas-caption">
              Scroll to zoom · drag the background to pan · select equipment to
              configure. Use Path list for controls without dragging.
            </p>
          </div>
          {pathView === "list" && (
            <SignalPathList
              chain={chain}
              onSelect={(index) => {
                setAddEquipmentState(null);
                setSwapState(null);
                setSelectedNodeIndex(index);
              }}
              onRemove={handleRequestRemoveNode}
              onSwap={(index) => {
                const node = chain.nodes[index];
                setSelectedNodeIndex(null);
                setActionError(null);
                setSwapState({
                  nodeIndex: index,
                  nodeType:
                    node.type === "feedline_run" ? "feedline" : node.type,
                });
              }}
            />
          )}
        </div>
        <aside
          className="sw-gear-shelf"
          aria-label="Equipment available for this path"
        >
          <EquipmentDrawer
            onDragActiveChange={setIsDraggingFromDrawer}
            activeChain={chain}
          />
        </aside>
      </div>

      {addEquipmentState && (
        <Dialog
          open
          onClose={() => setAddEquipmentState(null)}
          title="Add equipment to path"
        >
          {actionError && (
            <Notice tone="danger" title="Equipment not added" live>
              {actionError}
            </Notice>
          )}
          <AddEquipmentPanel
            position={addEquipmentState.position}
            automaticPlacement={addEquipmentState.allTypes}
            validTypes={
              addEquipmentState.allTypes
                ? ALL_EQUIPMENT_OPTIONS
                : getValidEquipmentTypes(
                    addEquipmentState.position > 0
                      ? getNodeRank(
                          chain.nodes[addEquipmentState.position - 1],
                          getAccessoryCategory,
                        )
                      : null,
                    addEquipmentState.position < chain.nodes.length
                      ? getNodeRank(
                          chain.nodes[addEquipmentState.position],
                          getAccessoryCategory,
                        )
                      : null,
                  )
            }
            onAdd={(nodeType, equipmentId) => {
              const result = handleDropEquipment(
                nodeType,
                equipmentId,
                addEquipmentState.allTypes
                  ? undefined
                  : addEquipmentState.position,
              );
              if (result.ok) setAddEquipmentState(null);
            }}
            onCancel={() => setAddEquipmentState(null)}
          />
        </Dialog>
      )}

      {swapState && (
        <Dialog open onClose={() => setSwapState(null)} title="Swap equipment">
          {actionError && (
            <Notice tone="danger" title="Equipment not swapped" live>
              {actionError}
            </Notice>
          )}
          <AddEquipmentPanel
            position={swapState.nodeIndex}
            validTypes={ALL_EQUIPMENT_OPTIONS.filter((opt) => {
              if (swapState.nodeType === "radio")
                return opt.nodeType === "radio";
              if (swapState.nodeType === "antenna")
                return opt.nodeType === "antenna";
              if (swapState.nodeType === "feedline")
                return opt.nodeType === "feedline_run";
              if (swapState.nodeType === "accessory") {
                const swapNode = chain.nodes[swapState.nodeIndex];
                if (swapNode.type === "accessory") {
                  const acc = accessories.find(
                    (a) => a.id === swapNode.accessoryId,
                  );
                  return (
                    opt.nodeType === "accessory" &&
                    opt.accessoryCategory === acc?.category
                  );
                }
              }
              return false;
            })}
            onAdd={(_nodeType, equipmentId) => {
              const result = swapNodeEquipment(
                chain.id,
                swapState.nodeIndex,
                equipmentId,
              );
              setActionError(result.ok ? null : result.error);
              if (result.ok) setSwapState(null);
            }}
            onCancel={() => setSwapState(null)}
          />
        </Dialog>
      )}

      {availableBands.length > 0 && (
        <Disclosure
          title="Estimated performance"
          summary="Loss budget and per-band analysis"
        >
          <p className="su-hint">
            Calculated from the equipment and settings in this path. These are
            model estimates, not physical measurements.
          </p>
          {/* Loss Budget Bar */}
          {availableBands.length > 0 && (
            <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Loss Budget
              </h3>
              <LossBudgetBar
                bandPerformance={selectedBandPerformance}
                availableBands={availableBands}
                selectedBand={selectedBand}
                onSelectBand={onSelectBand}
              />
            </div>
          )}

          {/* Performance Sidebar */}
          {availableBands.length > 0 && (
            <PerformanceSidebar
              chainPerformance={chainPerformance}
              selectedBand={selectedBand}
              onSelectBand={onSelectBand}
            />
          )}
        </Disclosure>
      )}

      {/* Node Config Panel */}
      {selectedNodeIndex != null && (
        <NodeConfigPanel
          chain={chain}
          nodeIndex={selectedNodeIndex}
          onClose={() => setSelectedNodeIndex(null)}
          onRemoveNode={handleRequestRemoveNode}
          onSwapEquipment={(nodeIndex) => {
            const node = chain.nodes[nodeIndex];
            if (!node) return;
            setSelectedNodeIndex(null);
            setActionError(null);
            setSwapState({
              nodeIndex,
              nodeType: node.type === "feedline_run" ? "feedline" : node.type,
            });
          }}
        />
      )}

      {/* Confirm dialog for destructive actions */}
      {confirmAction &&
        createPortal(
          <ConfirmDialog
            open={true}
            title="Remove from Signal Path?"
            message={`Remove ${confirmAction.label} from the signal path? This action cannot be undone.`}
            confirmLabel="Remove"
            variant="destructive"
            onConfirm={handleConfirmRemoveNode}
            onCancel={() => setConfirmAction(null)}
          />,
          document.body,
        )}

      {/* Node context menu */}
      {contextMenu &&
        (() => {
          const node = chain.nodes[contextMenu.nodeIndex];
          const nodeType = node?.type ?? "radio";
          let nodeName = "Unknown";
          if (node) {
            switch (node.type) {
              case "radio":
                nodeName = "Radio";
                break;
              case "antenna":
                nodeName = "Antenna";
                break;
              case "feedline_run":
                nodeName = "Feedline";
                break;
              case "accessory": {
                const acc = accessories.find((a) => a.id === node.accessoryId);
                nodeName = acc?.name ?? "Accessory";
                break;
              }
            }
          }
          return (
            <NodeContextMenu
              nodeIndex={contextMenu.nodeIndex}
              nodeType={nodeType}
              nodeName={nodeName}
              x={contextMenu.x}
              y={contextMenu.y}
              canMoveLeft={contextMenu.nodeIndex > 0}
              canMoveRight={contextMenu.nodeIndex < chain.nodes.length - 1}
              onConfigure={handleContextConfigure}
              onSwap={() => {
                if (contextMenu) {
                  const swapNode = chain.nodes[contextMenu.nodeIndex];
                  setAddEquipmentState(null); // close add panel
                  setSelectedNodeIndex(null); // close config panel
                  setActionError(null);
                  setSwapState({
                    nodeIndex: contextMenu.nodeIndex,
                    nodeType:
                      swapNode.type === "feedline_run"
                        ? "feedline"
                        : swapNode.type,
                  });
                  setContextMenu(null);
                }
              }}
              onRemove={handleContextRemove}
              onMoveLeft={handleContextMoveLeft}
              onMoveRight={handleContextMoveRight}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}
    </div>
  );
}

// ---- Chain card header with inline name edit + power popover ----------------

interface ChainCardHeaderProps {
  chain: StationChain;
  isExpanded: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  selectedBand: string;
}

function ChainCardHeader({
  chain,
  isExpanded,
  onToggle,
  onDuplicate,
  onDelete,
  selectedBand,
}: ChainCardHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(chain.name);
  const [showPowerPopover, setShowPowerPopover] = useState(false);
  const updateChain = useShackStore((s) => s.updateChain);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const powerPopoverRef = useRef<HTMLDivElement>(null);

  // Focus name input when editing starts
  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  // Close power popover on outside click
  useEffect(() => {
    if (!showPowerPopover) return;
    function handleClick(e: MouseEvent) {
      if (
        powerPopoverRef.current &&
        !powerPopoverRef.current.contains(e.target as Node)
      ) {
        setShowPowerPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPowerPopover]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== chain.name) {
      updateChain(chain.id, { name: trimmed });
    } else {
      setEditName(chain.name);
    }
    setIsEditingName(false);
  }, [editName, chain.id, chain.name, updateChain]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleNameSubmit();
      } else if (e.key === "Escape") {
        setEditName(chain.name);
        setIsEditingName(false);
      }
    },
    [handleNameSubmit, chain.name],
  );

  const handlePowerSelect = useCallback(
    (watts: number) => {
      updateChain(chain.id, { operatingPowerWatts: watts });
      setShowPowerPopover(false);
    },
    [chain.id, updateChain],
  );

  // Get chain performance for strip preview
  const chainPerformance = useChainPerformance(chain.id);
  const bandPerf = useMemo(() => {
    return chainPerformance.bands.find((b) => b.band === selectedBand) ?? null;
  }, [chainPerformance.bands, selectedBand]);

  const totalLossDb = useMemo(() => {
    if (!bandPerf) return undefined;
    return bandPerf.nodes.reduce((sum, n) => sum + n.lossDb, 0);
  }, [bandPerf]);

  const totalGainDb = useMemo(() => {
    if (!bandPerf) return undefined;
    return bandPerf.nodes.reduce((sum, n) => sum + n.gainDb, 0);
  }, [bandPerf]);

  const health: "complete" | "incomplete" | "error" = useMemo(() => {
    const hasRadio = chain.nodes.some((n) => n.type === "radio");
    const hasAntenna = chain.nodes.some((n) => n.type === "antenna");
    if (hasRadio && hasAntenna) return "complete";
    return "incomplete";
  }, [chain.nodes]);

  return (
    <div className="sw-chain-heading">
      <div className="sw-chain-header">
        <div className="sw-chain-name">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              aria-label="Signal path name"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              className="sw-name-input"
              maxLength={50}
            />
          ) : (
            <h3>{chain.name}</h3>
          )}
          <p className="su-hint">
            {chain.nodes.length} equipment positions ·{" "}
            {chain.feedlineRuns.length} cable runs
          </p>
        </div>
        <IconButton
          label={`Rename ${chain.name}`}
          onClick={() => {
            setEditName(chain.name);
            setIsEditingName(true);
          }}
        >
          <Pencil size={17} aria-hidden="true" />
        </IconButton>
        <div className="sw-power-control" ref={powerPopoverRef}>
          <Button
            aria-expanded={showPowerPopover}
            aria-label={`Set ${chain.name} operating power, currently ${chain.operatingPowerWatts} watts`}
            onClick={() => setShowPowerPopover((v) => !v)}
          >
            <span className="su-mono">{chain.operatingPowerWatts} W</span>
            <ChevronDown size={16} aria-hidden="true" />
          </Button>
          {showPowerPopover && (
            <div
              className="sw-power-popover"
              role="group"
              aria-label="Operating power presets"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setShowPowerPopover(false);
                  (
                    powerPopoverRef.current?.querySelector(
                      "button",
                    ) as HTMLButtonElement | null
                  )?.focus();
                }
              }}
            >
              <p className="su-hint">Operating power</p>
              {POWER_PRESETS.map((watts) => (
                <Button
                  key={watts}
                  aria-pressed={chain.operatingPowerWatts === watts}
                  onClick={() => handlePowerSelect(watts)}
                >
                  {watts} W
                </Button>
              ))}
            </div>
          )}
        </div>
        <IconButton label={`Duplicate ${chain.name}`} onClick={onDuplicate}>
          <Copy size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label={`Delete ${chain.name}`} onClick={onDelete}>
          <Trash2 size={18} aria-hidden="true" />
        </IconButton>
        <Button
          aria-expanded={isExpanded}
          onClick={onToggle}
          className="sw-open-path"
        >
          {isExpanded ? "Close path" : "Open path"}
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{ transform: isExpanded ? "rotate(180deg)" : undefined }}
          />
        </Button>
      </div>
      {isExpanded && (
        <div className="sw-chain-selection">
          <Badge tone="info">Selected in ProPulse</Badge>
          <span className="su-hint">Changes update this path directly.</span>
        </div>
      )}

      {/* Collapsed: ChainStripPreview */}
      {!isExpanded && (
        <div className="px-4 pb-3">
          <ChainStripPreview
            chain={chain}
            totalLossDb={totalLossDb}
            totalGainDb={totalGainDb}
            health={health}
          />
        </div>
      )}
    </div>
  );
}

// ---- Main AllChainsView component -------------------------------------------

export function AllChainsView({
  selectedBand,
  onSelectBand,
}: AllChainsViewProps) {
  const chains = useStationChains();
  const activeChain = useActiveChain();
  const addChain = useShackStore((s) => s.addChain);
  const removeChain = useShackStore((s) => s.removeChain);
  const duplicateChain = useShackStore((s) => s.duplicateChain);
  const setActiveChain = useShackStore((s) => s.setActiveChain);

  // View mode toggle: edit (accordion) vs schematic (full overview)
  const [viewMode, setViewMode] = useState<"edit" | "schematic">("edit");

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    chainId: string;
    name: string;
  } | null>(null);

  // Refs for auto-scrolling expanded chain into view
  const chainCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll when active chain changes
  useEffect(() => {
    if (!activeChain) return;
    const el = chainCardRefs.current[activeChain.id];
    if (el) {
      // Small delay for the expand animation to start
      const timer = setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeChain?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateChain = useCallback(() => {
    const chainId = addChain({
      name: `Signal Path ${chains.length + 1}`,
      nodes: [],
      feedlineRuns: [],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
    });
    if (chainId) setActiveChain(chainId);
  }, [addChain, setActiveChain, chains.length]);

  const handleToggleChain = useCallback(
    (chainId: string) => {
      if (activeChain?.id === chainId) {
        // Already expanded -- collapse (deselect)
        setActiveChain(null);
        return;
      }
      setActiveChain(chainId);
    },
    [activeChain?.id, setActiveChain],
  );

  const handleDeleteChain = useCallback((chain: StationChain) => {
    setDeleteConfirm({ chainId: chain.id, name: chain.name });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    removeChain(deleteConfirm.chainId);
    setDeleteConfirm(null);
  }, [deleteConfirm, removeChain]);

  const handleDuplicateChain = useCallback(
    (chainId: string) => {
      const newId = duplicateChain(chainId);
      if (newId) setActiveChain(newId);
    },
    [duplicateChain, setActiveChain],
  );

  // Switch back to edit mode when schematic row is clicked
  const handleSchematicEditChain = useCallback((_chainId: string) => {
    setViewMode("edit");
  }, []);

  // Create chain from schematic empty state and switch to edit mode
  const handleCreateChainFromSchematic = useCallback(() => {
    const chainId = addChain({
      name: `Signal Path ${chains.length + 1}`,
      nodes: [],
      feedlineRuns: [],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
    });
    if (chainId) setActiveChain(chainId);
    setViewMode("edit");
  }, [addChain, setActiveChain, chains.length]);

  return (
    <div className="space-y-3">
      <div className="sw-workspace-toolbar">
        <div
          className="sw-view-switch"
          role="group"
          aria-label="Workbench view"
        >
          <Button
            variant="quiet"
            aria-pressed={viewMode === "edit"}
            onClick={() => setViewMode("edit")}
          >
            <Pencil size={17} aria-hidden="true" /> Build signal paths
          </Button>
          <Button
            variant="quiet"
            aria-pressed={viewMode === "schematic"}
            onClick={() => setViewMode("schematic")}
          >
            <Layers size={17} aria-hidden="true" /> Shack overview
          </Button>
        </div>
        <Button onClick={handleCreateChainFromSchematic}>
          <Plus size={18} aria-hidden="true" /> New signal path
        </Button>
      </div>
      {viewMode === "edit" && !activeChain && (
        <Notice title="Choose a signal path to work on">
          Open a path below to select it in ProPulse and edit its equipment.
          Opening a different path changes the selected path.
        </Notice>
      )}

      {/* Schematic view */}
      {viewMode === "schematic" && (
        <ShackSchematicView
          selectedBand={selectedBand}
          onSelectBand={onSelectBand}
          onEditChain={handleSchematicEditChain}
          onCreateChain={handleCreateChainFromSchematic}
        />
      )}

      {/* Edit view (accordion cards) */}
      {viewMode === "edit" && (
        <>
          {/* Chain cards */}
          {chains.map((chain) => {
            const isExpanded = chain.id === activeChain?.id;

            return (
              <div
                key={chain.id}
                ref={(el) => {
                  chainCardRefs.current[chain.id] = el;
                }}
                className={`sw-chain-card ${isExpanded ? "sw-chain-card--open" : ""}`}
              >
                <ChainCardHeader
                  chain={chain}
                  isExpanded={isExpanded}
                  onToggle={() => handleToggleChain(chain.id)}
                  onDuplicate={() => handleDuplicateChain(chain.id)}
                  onDelete={() => handleDeleteChain(chain)}
                  selectedBand={selectedBand}
                />

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    <div className="pt-3">
                      <ExpandedChainBody
                        chain={chain}
                        selectedBand={selectedBand}
                        onSelectBand={onSelectBand}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <Button onClick={handleCreateChain} className="sw-add-path">
            <Plus size={18} aria-hidden="true" /> Add signal path
          </Button>
        </>
      )}

      {/* Delete chain confirmation dialog */}
      {deleteConfirm &&
        createPortal(
          <ConfirmDialog
            open={true}
            title="Delete Signal Path?"
            message={`Delete "${deleteConfirm.name}"? This will remove the signal path and all its nodes.`}
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeleteConfirm(null)}
          />,
          document.body,
        )}
    </div>
  );
}
