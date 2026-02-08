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
import { useIsMobile } from "@/hooks/useIsMobile";
import type { StationChain, ChainNode } from "@/types/stationChain";
import type { AccessoryCategory } from "@/types/shack";
import {
  ALL_EQUIPMENT_OPTIONS,
  computeInsertPosition,
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
  const isMobile = useIsMobile();

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
  } | null>(null);
  const [swapState, setSwapState] = useState<{
    nodeIndex: number;
    nodeType: string;
  } | null>(null);

  // ---- Escape key closes add/swap modals -----------------------------------
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (addEquipmentState) {
          setAddEquipmentState(null);
          return;
        }
        if (swapState) {
          setSwapState(null);
          return;
        }
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [addEquipmentState, swapState]);

  // ---- Store actions --------------------------------------------------------
  const addNodeToChain = useShackStore((s) => s.addNodeToChain);
  const removeNodeFromChain = useShackStore((s) => s.removeNodeFromChain);
  const addFeedlineRun = useShackStore((s) => s.addFeedlineRun);
  const updateFeedlineRun = useShackStore((s) => s.updateFeedlineRun);
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
    (nodeType: string, equipmentId: string, _position: number) => {
      if (nodeType === "shack_accessory") {
        if (chain.shackAccessoryIds.includes(equipmentId)) return;
        updateChain(chain.id, {
          shackAccessoryIds: [...chain.shackAccessoryIds, equipmentId],
        });
        return;
      }

      if (nodeType === "feedline") {
        addFeedlineRun(chain.id, {
          feedlineId: equipmentId,
          inlineComponentIds: [],
        });
        return;
      }

      if (nodeType === "inline") {
        const firstRun = chain.feedlineRuns[0];
        if (!firstRun) return;
        if (firstRun.inlineComponentIds.includes(equipmentId)) return;
        updateFeedlineRun(chain.id, firstRun.id, {
          inlineComponentIds: [...firstRun.inlineComponentIds, equipmentId],
        });
        return;
      }

      let node: ChainNode;
      switch (nodeType) {
        case "radio":
          node = { type: "radio", radioId: equipmentId };
          break;
        case "antenna":
          node = { type: "antenna", antennaId: equipmentId };
          break;
        case "accessory":
          node = { type: "accessory", accessoryId: equipmentId };
          break;
        default:
          console.warn(`[AllChainsView] Unknown node type: ${nodeType}`);
          return;
      }

      const idealPosition = computeInsertPosition(
        chain.nodes,
        node,
        getAccessoryCategory,
      );
      addNodeToChain(chain.id, node, idealPosition);
    },
    [
      chain,
      addNodeToChain,
      addFeedlineRun,
      updateFeedlineRun,
      updateChain,
      getAccessoryCategory,
    ],
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
    setAddEquipmentState({ position });
  }, []);

  return (
    <div className="space-y-3">
      {/* Contextual step hints + ground bus toggle */}
      <div
        className={`flex items-center gap-3 ${isMobile ? "flex-col" : "flex-row justify-between"}`}
      >
        {!hasNodes && (
          <p className="text-xs text-gray-500 italic">
            Step 1: Drag a radio from below to start
          </p>
        )}
        {hasNodes && hasRadio && !hasAntenna && (
          <p className="text-xs text-gray-500 italic">
            Next: Add an antenna to complete the signal path
          </p>
        )}

        {hasNodes && (
          <button
            type="button"
            onClick={() => setShowGroundBus((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showGroundBus
                ? "bg-signal-green/15 text-signal-green border border-signal-green/30"
                : "bg-panel/50 text-gray-400 border border-white/10 hover:text-gray-300"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" d="M12 4v8m-6 0h12m-10 4h8m-6 4h4" />
            </svg>
            Ground
          </button>
        )}
      </div>

      {/* Chain validation warnings */}
      {chainWarnings.length > 0 && (
        <ChainWarningBanner warnings={chainWarnings} />
      )}

      {/* Builder Canvas */}
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

      {/* Add Equipment Panel (modal overlay) */}
      {addEquipmentState &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAddEquipmentState(null);
            }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative bg-void-black/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Add Equipment
                </h3>
                <button
                  type="button"
                  onClick={() => setAddEquipmentState(null)}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <AddEquipmentPanel
                position={addEquipmentState.position}
                validTypes={getValidEquipmentTypes(
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
                )}
                onAdd={(nodeType, equipmentId) => {
                  handleDropEquipment(
                    nodeType,
                    equipmentId,
                    addEquipmentState.position,
                  );
                  setAddEquipmentState(null);
                }}
                onCancel={() => setAddEquipmentState(null)}
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Swap Equipment Panel (modal overlay) */}
      {swapState &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSwapState(null);
            }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative bg-void-black/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Swap Equipment
                </h3>
                <button
                  type="button"
                  onClick={() => setSwapState(null)}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
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
                  swapNodeEquipment(chain.id, swapState.nodeIndex, equipmentId);
                  setSwapState(null);
                }}
                onCancel={() => setSwapState(null)}
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Equipment Drawer */}
      <EquipmentDrawer
        onDragActiveChange={setIsDraggingFromDrawer}
        activeChain={chain}
      />

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
            title="Remove from Chain?"
            message={`Remove ${confirmAction.label} from the signal chain? This action cannot be undone.`}
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
    <div className="space-y-0">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none min-h-[80px]"
        onClick={(e) => {
          // Don't toggle when clicking interactive elements
          if ((e.target as HTMLElement).closest("button, input")) return;
          onToggle();
        }}
      >
        {/* Chain name (inline editable) */}
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              className="bg-void-black/80 border border-plasma-orange/50 rounded-lg px-2 py-1 text-base font-semibold text-gray-200 outline-none w-full max-w-[240px]"
              maxLength={50}
            />
          ) : (
            <div className="flex items-center gap-2">
              <h3
                className="text-base font-semibold text-gray-200 truncate"
                onDoubleClick={() => {
                  setEditName(chain.name);
                  setIsEditingName(true);
                }}
              >
                {chain.name}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(chain.name);
                  setIsEditingName(true);
                }}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                aria-label="Edit chain name"
              >
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
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Node count */}
          <p className="text-xs text-gray-500 mt-0.5">
            {chain.nodes.length} node{chain.nodes.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Power badge (with popover) */}
        <div className="relative" ref={powerPopoverRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPowerPopover((v) => !v);
            }}
            className="px-2.5 py-1 rounded-lg bg-plasma-orange/10 text-plasma-orange text-xs font-semibold border border-plasma-orange/20 hover:border-plasma-orange/40 transition-colors min-h-[32px]"
          >
            {chain.operatingPowerWatts >= 1000
              ? `${(chain.operatingPowerWatts / 1000).toFixed(1)}kW`
              : `${chain.operatingPowerWatts}W`}
          </button>

          {showPowerPopover && (
            <div className="absolute top-full right-0 mt-1 z-40 bg-void-black/95 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-1.5 flex flex-wrap gap-1 w-[200px]">
              {POWER_PRESETS.map((watts) => (
                <button
                  key={watts}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePowerSelect(watts);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
                    chain.operatingPowerWatts === watts
                      ? "bg-plasma-orange text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {watts >= 1000 ? `${watts / 1000}kW` : `${watts}W`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons: Duplicate, Delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Duplicate chain"
            title="Duplicate"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg hover:bg-alert-red/10 text-gray-400 hover:text-alert-red transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Delete chain"
            title="Delete"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
        </div>

        {/* Expand/Collapse chevron */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          aria-label={isExpanded ? "Collapse chain" : "Expand chain"}
        >
          <svg
            className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

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
      name: `Chain ${chains.length + 1}`,
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

  return (
    <div className="space-y-3">
      {/* Chain cards */}
      {chains.map((chain) => {
        const isExpanded = chain.id === activeChain?.id;

        return (
          <div
            key={chain.id}
            ref={(el) => {
              chainCardRefs.current[chain.id] = el;
            }}
            className={`
              bg-panel/30 backdrop-blur-sm border rounded-2xl
              transition-all duration-300 overflow-hidden
              ${
                isExpanded
                  ? "border-plasma-orange/20"
                  : "border-white/5 hover:border-white/10"
              }
            `}
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

      {/* "+ Add New Chain" card */}
      <button
        type="button"
        onClick={handleCreateChain}
        className="
          w-full flex items-center justify-center gap-2 py-4
          bg-panel/10 border-2 border-dashed border-white/10
          rounded-2xl text-gray-400 hover:text-gray-200
          hover:border-white/20 hover:bg-panel/20
          transition-all duration-200 min-h-[60px]
        "
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-sm font-medium">Add Chain</span>
      </button>

      {/* Delete chain confirmation dialog */}
      {deleteConfirm &&
        createPortal(
          <ConfirmDialog
            open={true}
            title="Delete Chain?"
            message={`Delete "${deleteConfirm.name}"? This will remove the chain and all its nodes.`}
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
