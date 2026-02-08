/**
 * StationBuilderLab — Top-level assembly component for the visual signal
 * chain builder.
 *
 * Orchestrates: ChainSelector, BuilderCanvas, LossBudgetBar, EquipmentDrawer,
 * NodeConfigPanel, and PerformanceSidebar.
 */

import { useState, useMemo, useCallback } from "react";
import {
  useShackStore,
  useActiveChain,
  useStationChains,
} from "@/stores/shackStore";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { ChainNode } from "@/types/stationChain";
import { BuilderCanvas } from "./BuilderCanvas";
import { ChainSelector } from "./ChainSelector";
import { EquipmentDrawer } from "./EquipmentDrawer";
import { LossBudgetBar } from "./LossBudgetBar";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { PerformanceSidebar } from "./PerformanceSidebar";

// ─── Component ──────────────────────────────────────────────────────────────

export function StationBuilderLab() {
  const isMobile = useIsMobile();

  // ── State ──────────────────────────────────────────────────────────────
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(
    null,
  );
  const [selectedBand, setSelectedBand] = useState<string>("20m");
  const [isDraggingFromDrawer, setIsDraggingFromDrawer] = useState(false);

  // ── Store ──────────────────────────────────────────────────────────────
  const chains = useStationChains();
  const activeChain = useActiveChain();
  const addChain = useShackStore((s) => s.addChain);
  const removeChain = useShackStore((s) => s.removeChain);
  const duplicateChain = useShackStore((s) => s.duplicateChain);
  const setActiveChain = useShackStore((s) => s.setActiveChain);
  const addNodeToChain = useShackStore((s) => s.addNodeToChain);
  const removeNodeFromChain = useShackStore((s) => s.removeNodeFromChain);
  const addFeedlineRun = useShackStore((s) => s.addFeedlineRun);
  const updateFeedlineRun = useShackStore((s) => s.updateFeedlineRun);

  // ── Chain performance ──────────────────────────────────────────────────
  const chainPerformance = useChainPerformance(activeChain?.id);

  // ── Derived: available bands ───────────────────────────────────────────
  const availableBands = useMemo(() => {
    const bands = chainPerformance.bands.map((b) => b.band);
    return [...new Set(bands)];
  }, [chainPerformance.bands]);

  // ── Band performance for the selected band ─────────────────────────────
  const selectedBandPerformance = useMemo(() => {
    return chainPerformance.bands.find((b) => b.band === selectedBand) ?? null;
  }, [chainPerformance.bands, selectedBand]);

  // ── Create new chain ───────────────────────────────────────────────────
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

  // ── Drop equipment from drawer ─────────────────────────────────────────
  const handleDropEquipment = useCallback(
    (nodeType: string, equipmentId: string, position: number) => {
      if (!activeChain) return;

      if (nodeType === "feedline") {
        // Feedline drops use addFeedlineRun which auto-adds the node
        addFeedlineRun(activeChain.id, {
          feedlineId: equipmentId,
          inlineComponentIds: [],
        });
        return;
      }

      if (nodeType === "inline") {
        // Inline components go into feedline runs — add to the first run
        const firstRun = activeChain.feedlineRuns[0];
        if (!firstRun) return;
        if (firstRun.inlineComponentIds.includes(equipmentId)) return;
        updateFeedlineRun(activeChain.id, firstRun.id, {
          inlineComponentIds: [...firstRun.inlineComponentIds, equipmentId],
        });
        return;
      }

      // Build the appropriate ChainNode
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
          console.warn(`[StationBuilderLab] Unknown node type: ${nodeType}`);
          return;
      }

      addNodeToChain(activeChain.id, node, position);
    },
    [activeChain, addNodeToChain, addFeedlineRun, updateFeedlineRun],
  );

  // ── Remove node ────────────────────────────────────────────────────────
  const handleRemoveNode = useCallback(
    (nodeIndex: number) => {
      if (!activeChain) return;
      removeNodeFromChain(activeChain.id, nodeIndex);
      setSelectedNodeIndex(null);
    },
    [activeChain, removeNodeFromChain],
  );

  // ── Derived: chain analysis for contextual hints ────────────────────────
  const hasNodes = activeChain ? activeChain.nodes.length > 0 : false;
  const hasRadio = activeChain
    ? activeChain.nodes.some((n) => n.type === "radio")
    : false;
  const hasAntenna = activeChain
    ? activeChain.nodes.some((n) => n.type === "antenna")
    : false;

  // ── Empty state: no chains at all ────────────────────────────────────────
  if (chains.length === 0 || !activeChain) {
    return (
      <div className="space-y-4">
        {/* Empty state card with create CTA */}
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-plasma-orange/10 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-plasma-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-200">
              Build Your First Station Chain
            </h3>
            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
              A station chain maps the signal path from your radio through
              cables and accessories to the antenna. Create one to visualize
              your setup and calculate performance.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateChain}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-plasma-orange text-white text-sm font-medium hover:bg-plasma-orange/90 transition-colors"
          >
            <svg
              className="w-4 h-4"
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
            Create Station Chain
          </button>
        </div>
      </div>
    );
  }

  // ── Active builder view ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Chain selector row */}
      <div
        className={`flex items-center gap-3 ${isMobile ? "flex-col" : "flex-row justify-between"}`}
      >
        <div className={`flex items-center gap-2 ${isMobile ? "w-full" : ""}`}>
          <div className={isMobile ? "flex-1" : "w-56"}>
            <ChainSelector
              activeChain={activeChain}
              chains={chains}
              onSelect={setActiveChain}
              onCreate={handleCreateChain}
              onDelete={removeChain}
              onDuplicate={duplicateChain}
            />
          </div>
        </div>

        {/* Contextual step hints */}
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
      </div>

      {/* Builder Canvas */}
      <BuilderCanvas
        chain={activeChain}
        selectedNodeIndex={selectedNodeIndex}
        onSelectNode={setSelectedNodeIndex}
        onDropEquipment={handleDropEquipment}
        selectedBand={selectedBand}
        isDraggingFromDrawer={isDraggingFromDrawer}
      />

      {/* Equipment Drawer — always visible, right below canvas for easy drag */}
      <EquipmentDrawer
        onDragActiveChange={setIsDraggingFromDrawer}
        activeChain={activeChain}
      />

      {/* Loss Budget Bar — only show when band data is available */}
      {availableBands.length > 0 && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Loss Budget
          </h3>
          <LossBudgetBar
            bandPerformance={selectedBandPerformance}
            availableBands={availableBands}
            selectedBand={selectedBand}
            onSelectBand={setSelectedBand}
          />
        </div>
      )}

      {/* Performance Sidebar — only show when band data is available */}
      {availableBands.length > 0 && (
        <PerformanceSidebar
          chainPerformance={chainPerformance}
          selectedBand={selectedBand}
          onSelectBand={setSelectedBand}
        />
      )}

      {/* Node Config Panel (slides in from right when a node is selected) */}
      {selectedNodeIndex != null && activeChain && (
        <NodeConfigPanel
          chain={activeChain}
          nodeIndex={selectedNodeIndex}
          onClose={() => setSelectedNodeIndex(null)}
          onRemoveNode={handleRemoveNode}
        />
      )}
    </div>
  );
}
