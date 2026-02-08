/**
 * BuilderCanvas — Main SVG canvas for the visual station signal chain builder.
 *
 * Orchestrates all ChainNode, FeedlineRunNode, ConnectionLine, and DropZone
 * components. Resolves equipment names from shack store hooks, computes
 * connector compatibility, and manages horizontal pipeline layout.
 */

import React, { useMemo, useCallback, useState } from "react";
import type { StationChain } from "@/types/stationChain";
import {
  FEEDLINE_TYPE_LABELS,
  ACCESSORY_CATEGORY_LABELS,
  ANTENNA_TYPE_LABELS,
} from "@/types/shack";
import {
  useShackStore,
  useUserRadios,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
  useInlineComponents,
} from "@/stores/shackStore";
import {
  checkChainCompatibility,
  getNodeInputConnector,
  getNodeOutputConnector,
} from "@/lib/data/connectors";
import type { ChainEquipmentData } from "@/lib/data/connectors";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import type { NodePerformance } from "@/hooks/useChainPerformance";
import { ChainNode } from "./ChainNode";
import { FeedlineRunNode, getFeedlineRunNodeHeight } from "./FeedlineRunNode";
import { ConnectionLine } from "./ConnectionLine";
import { DropZone } from "./DropZone";

// ─── Layout Constants ────────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const FEEDLINE_NODE_WIDTH = 200;
const NODE_HEIGHT = 90;
const NODE_SPACING = 60; // space between nodes for lines + drop zones
const CANVAS_PADDING_X = 30;
const CANVAS_PADDING_Y = 20;
const DROP_ZONE_WIDTH = 40;
const MIN_CANVAS_HEIGHT = 260;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BuilderCanvasProps {
  chain: StationChain;
  selectedNodeIndex: number | null;
  onSelectNode: (index: number | null) => void;
  onDropEquipment: (
    nodeType: string,
    equipmentId: string,
    position: number,
  ) => void;
  /** Band key for performance display (e.g., "20m") */
  selectedBand?: string;
  /** When true, shows drop zones between nodes */
  isDraggingFromDrawer?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  isFeedlineRun: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BuilderCanvas({
  chain,
  selectedNodeIndex,
  onSelectNode,
  onDropEquipment,
  selectedBand,
  isDraggingFromDrawer,
}: BuilderCanvasProps) {
  // ── Store data ──────────────────────────────────────────────────────────
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineComponents = useInlineComponents();
  const storeRadios = useShackStore((s) => s.radios);
  const customRadios = useShackStore((s) => s.customRadios);
  const reorderChainNodes = useShackStore((s) => s.reorderChainNodes);

  // ── Drop zone hover state ───────────────────────────────────────────────
  const [activeDropIndex, setActiveDropIndex] = useState<number | null>(null);

  // ── Equipment data for connector engine ─────────────────────────────────
  const equipmentData: ChainEquipmentData = useMemo(
    () => ({
      radios: storeRadios,
      customRadios,
      antennas,
      feedlines,
      inlineComponents,
      accessories,
    }),
    [
      storeRadios,
      customRadios,
      antennas,
      feedlines,
      inlineComponents,
      accessories,
    ],
  );

  // ── Connector compatibility ─────────────────────────────────────────────
  const compatResults = useMemo(
    () => checkChainCompatibility(chain, equipmentData),
    [chain, equipmentData],
  );

  // ── Per-node connectors ─────────────────────────────────────────────────
  const nodeConnectors = useMemo(() => {
    return chain.nodes.map((node) => ({
      input: getNodeInputConnector(node, equipmentData, chain),
      output: getNodeOutputConnector(node, equipmentData, chain),
    }));
  }, [chain, equipmentData]);

  // ── Performance data ────────────────────────────────────────────────────
  const perfResult = useChainPerformance(chain.id);
  const bandPerf = useMemo(() => {
    if (!selectedBand) return null;
    return perfResult.bands.find((b) => b.band === selectedBand) ?? null;
  }, [perfResult.bands, selectedBand]);

  // ── Resolve labels for each node ────────────────────────────────────────
  const nodeLabels = useMemo(() => {
    return chain.nodes.map((node) => {
      let label = "Unknown";
      let subLabel: string | undefined;

      switch (node.type) {
        case "radio": {
          const radioEntry = radios.find(
            (r) => r.userRadio.id === node.radioId,
          );
          if (radioEntry?.equipment) {
            label =
              radioEntry.equipment.displayName ??
              `${radioEntry.equipment.manufacturer} ${radioEntry.equipment.model}`;
          }
          if (radioEntry?.userRadio.nickname) {
            label = radioEntry.userRadio.nickname;
          }
          subLabel = `${chain.operatingPowerWatts}W`;
          break;
        }
        case "accessory": {
          const acc = accessories.find((a) => a.id === node.accessoryId);
          if (acc) {
            label = acc.name;
            subLabel = ACCESSORY_CATEGORY_LABELS[acc.category];
          }
          break;
        }
        case "feedline_run": {
          const run = chain.feedlineRuns.find(
            (r) => r.id === node.feedlineRunId,
          );
          if (run) {
            const fl = feedlines.find((f) => f.id === run.feedlineId);
            if (fl) {
              label = fl.name;
              subLabel = `${FEEDLINE_TYPE_LABELS[fl.feedlineType]}, ${fl.lengthFeet} ft`;
            }
          }
          break;
        }
        case "antenna": {
          const ant = antennas.find((a) => a.id === node.antennaId);
          if (ant) {
            label = ant.name;
            subLabel = ANTENNA_TYPE_LABELS[ant.antennaType];
          }
          break;
        }
      }

      return { label, subLabel };
    });
  }, [chain, radios, accessories, feedlines, antennas]);

  // ── Feedline run inline labels ──────────────────────────────────────────
  const feedlineRunData = useMemo(() => {
    const map = new Map<
      string,
      {
        inlineLabels: Array<{ id: string; name: string; lossDb: number }>;
        totalLossDb: number;
      }
    >();

    for (const run of chain.feedlineRuns) {
      const runInlines = run.inlineComponentIds
        .map((cid) => inlineComponents.find((c) => c.id === cid))
        .filter(Boolean)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          lossDb: c!.insertionLossDb ?? 0,
        }));

      const totalLossDb = runInlines.reduce((sum, il) => sum + il.lossDb, 0);
      map.set(run.id, { inlineLabels: runInlines, totalLossDb });
    }

    return map;
  }, [chain.feedlineRuns, inlineComponents]);

  // ── Compute layout ──────────────────────────────────────────────────────
  const { nodeLayouts, svgWidth, svgHeight } = useMemo(() => {
    const layouts: NodeLayout[] = [];
    let curX = CANVAS_PADDING_X;
    let maxHeight = NODE_HEIGHT;

    for (let i = 0; i < chain.nodes.length; i++) {
      const node = chain.nodes[i];
      const isFeedlineRun = node.type === "feedline_run";
      const w = isFeedlineRun ? FEEDLINE_NODE_WIDTH : NODE_WIDTH;

      let h = NODE_HEIGHT;
      if (isFeedlineRun) {
        const run = chain.feedlineRuns.find(
          (r) => r.id === (node as { feedlineRunId: string }).feedlineRunId,
        );
        const inlineCount = run ? run.inlineComponentIds.length : 0;
        h = getFeedlineRunNodeHeight(inlineCount);
      }

      if (h > maxHeight) maxHeight = h;
      layouts.push({ x: curX, y: 0, width: w, height: h, isFeedlineRun });

      curX += w;
      // Add spacing unless this is the last node
      if (i < chain.nodes.length - 1) {
        curX += NODE_SPACING;
      }
    }

    const totalWidth = curX + CANVAS_PADDING_X;
    const totalHeight = Math.max(
      MIN_CANVAS_HEIGHT,
      maxHeight + CANVAS_PADDING_Y * 2,
    );

    // Vertically center all nodes
    for (const layout of layouts) {
      layout.y = (totalHeight - layout.height) / 2;
    }

    return {
      nodeLayouts: layouts,
      svgWidth: totalWidth,
      svgHeight: totalHeight,
    };
  }, [chain.nodes, chain.feedlineRuns]);

  // ── Node compatibility for input/output edges ───────────────────────────
  const nodeCompatibility = useMemo(() => {
    return chain.nodes.map((_, i) => {
      // Input compatibility: the connection coming INTO this node (from i-1)
      const inputResult = compatResults.find((r) => r.toIndex === i);
      // Output compatibility: the connection going OUT of this node (to i+1)
      const outputResult = compatResults.find((r) => r.fromIndex === i);
      return {
        inputCompatible: inputResult?.compatible,
        outputCompatible: outputResult?.compatible,
      };
    });
  }, [chain.nodes, compatResults]);

  // ── Get per-node performance for selected band ──────────────────────────
  const getNodePerformance = useCallback(
    (index: number): NodePerformance | undefined => {
      return bandPerf?.nodes.find((n) => n.nodeIndex === index);
    },
    [bandPerf],
  );

  // ── Drag handlers for reorder within canvas ─────────────────────────────
  const handleNodeDragStart = useCallback(
    (e: React.DragEvent, nodeIndex: number) => {
      e.dataTransfer.setData("application/x-chain-reorder", String(nodeIndex));
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDropZoneDragOver = useCallback(
    (e: React.DragEvent, position: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setActiveDropIndex(position);
    },
    [],
  );

  const handleDropZoneDragLeave = useCallback(() => {
    setActiveDropIndex(null);
  }, []);

  const handleDropZoneDrop = useCallback(
    (e: React.DragEvent, position: number) => {
      e.preventDefault();
      setActiveDropIndex(null);

      // Check for reorder from within canvas
      const reorderData = e.dataTransfer.getData("application/x-chain-reorder");
      if (reorderData) {
        const fromIndex = parseInt(reorderData, 10);
        if (
          !isNaN(fromIndex) &&
          fromIndex !== position &&
          fromIndex !== position - 1
        ) {
          const toIndex = position > fromIndex ? position - 1 : position;
          reorderChainNodes(chain.id, fromIndex, toIndex);
        }
        return;
      }

      // Check for equipment drop from drawer
      const equipJson = e.dataTransfer.getData("application/x-equipment");
      if (equipJson) {
        try {
          const { type: equipType, id: equipId } = JSON.parse(equipJson);
          if (equipType && equipId) {
            onDropEquipment(equipType, equipId, position);
          }
        } catch {
          // Malformed drag data — ignore
        }
      }
    },
    [chain.id, reorderChainNodes, onDropEquipment],
  );

  // ── Click background to deselect ────────────────────────────────────────
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onSelectNode(null);
      }
    },
    [onSelectNode],
  );

  // ── Drop handler for empty canvas (entire area is a drop zone) ──────────
  const handleEmptyCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setActiveDropIndex(0);
  }, []);

  const handleEmptyCanvasDragLeave = useCallback(() => {
    setActiveDropIndex(null);
  }, []);

  const handleEmptyCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setActiveDropIndex(null);
      const equipJson = e.dataTransfer.getData("application/x-equipment");
      if (equipJson) {
        try {
          const { type: equipType, id: equipId } = JSON.parse(equipJson);
          if (equipType && equipId) {
            onDropEquipment(equipType, equipId, 0);
          }
        } catch {
          // Malformed drag data
        }
      }
    },
    [onDropEquipment],
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (chain.nodes.length === 0) {
    const isDropHover = activeDropIndex != null;
    return (
      <div
        className={`
          relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden
          ${
            isDraggingFromDrawer
              ? isDropHover
                ? "border-plasma-orange bg-plasma-orange/10 shadow-[inset_0_0_40px_rgba(255,107,53,0.08)]"
                : "border-plasma-orange/50 bg-plasma-orange/5 animate-pulse"
              : "border-white/10 bg-panel/30 backdrop-blur-sm"
          }
        `}
        style={{ minHeight: MIN_CANVAS_HEIGHT }}
        onDragOver={handleEmptyCanvasDragOver}
        onDragLeave={handleEmptyCanvasDragLeave}
        onDrop={handleEmptyCanvasDrop}
      >
        {/* Dragging overlay */}
        {isDraggingFromDrawer && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-plasma-orange/20 border border-plasma-orange/40 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-plasma-orange"
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
              </div>
              <p className="text-sm font-medium text-plasma-orange">
                Drop here to add
              </p>
            </div>
          </div>
        )}

        {/* Guided empty state (hidden when dragging) */}
        {!isDraggingFromDrawer && (
          <div className="flex flex-col items-center justify-center h-full py-8 px-4">
            {/* Pipeline placeholder diagram */}
            <div className="flex items-center gap-2 mb-6">
              {/* Radio ghost */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-20 h-14 rounded-xl border border-plasma-orange/30 bg-plasma-orange/5 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-plasma-orange/50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"
                    />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500 font-medium">
                  Radio
                </span>
              </div>

              {/* Arrow */}
              <svg
                className="w-6 h-4 text-gray-600 shrink-0"
                viewBox="0 0 24 16"
                fill="currentColor"
              >
                <path d="M0 7h18l-4-4 1.5-1.5L22 8l-6.5 6.5L14 13l4-4H0z" />
              </svg>

              {/* Feedline ghost */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-20 h-14 rounded-xl border border-caution-amber/30 bg-caution-amber/5 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-caution-amber/50"
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
                <span className="text-[10px] text-gray-500 font-medium">
                  Cable
                </span>
              </div>

              {/* Arrow */}
              <svg
                className="w-6 h-4 text-gray-600 shrink-0"
                viewBox="0 0 24 16"
                fill="currentColor"
              >
                <path d="M0 7h18l-4-4 1.5-1.5L22 8l-6.5 6.5L14 13l4-4H0z" />
              </svg>

              {/* Antenna ghost */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-20 h-14 rounded-xl border border-signal-green/30 bg-signal-green/5 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-signal-green/50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.981 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12zm0 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                    />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500 font-medium">
                  Antenna
                </span>
              </div>
            </div>

            {/* Instructions */}
            <p className="text-sm text-gray-400 text-center max-w-xs">
              Drag equipment from the drawer below to start building your signal
              chain
            </p>

            {/* Animated down arrow */}
            <div className="mt-3 animate-bounce">
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active chain render ───────────────────────────────────────────────────

  return (
    <div className="overflow-x-auto rounded-2xl bg-panel/30 backdrop-blur-sm border border-white/5">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ minWidth: svgWidth }}
        role="img"
        aria-label={`Signal chain builder: ${chain.name}`}
        onClick={handleBackgroundClick}
      >
        {/* Connection lines between adjacent nodes */}
        {compatResults.map((result) => {
          const fromLayout = nodeLayouts[result.fromIndex];
          const toLayout = nodeLayouts[result.toIndex];
          if (!fromLayout || !toLayout) return null;

          const fromX = fromLayout.x + fromLayout.width;
          const fromY = fromLayout.y + fromLayout.height / 2;
          const toX = toLayout.x;
          const toY = toLayout.y + toLayout.height / 2;

          // Get performance data for the connection
          const toNodePerf = getNodePerformance(result.toIndex);
          const lossDb =
            toNodePerf && toNodePerf.lossDb > 0 ? toNodePerf.lossDb : undefined;
          const gainDb =
            toNodePerf && toNodePerf.gainDb > 0 ? toNodePerf.gainDb : undefined;

          return (
            <ConnectionLine
              key={`conn-${result.fromIndex}-${result.toIndex}`}
              fromX={fromX}
              fromY={fromY}
              toX={toX}
              toY={toY}
              compatible={result.compatible}
              lossDb={lossDb}
              gainDb={gainDb}
            />
          );
        })}

        {/* Drop zones between nodes (and at start/end) */}
        {isDraggingFromDrawer &&
          Array.from({ length: chain.nodes.length + 1 }, (_, i) => {
            let dzX: number;
            let dzY: number;

            if (i === 0) {
              // Before first node
              dzX = CANVAS_PADDING_X - DROP_ZONE_WIDTH - 4;
              dzY = svgHeight / 2 - NODE_HEIGHT / 2;
            } else if (i === chain.nodes.length) {
              // After last node
              const lastLayout = nodeLayouts[nodeLayouts.length - 1];
              dzX = lastLayout
                ? lastLayout.x + lastLayout.width + 10
                : CANVAS_PADDING_X;
              dzY = svgHeight / 2 - NODE_HEIGHT / 2;
            } else {
              // Between nodes i-1 and i
              const prevLayout = nodeLayouts[i - 1];
              const nextLayout = nodeLayouts[i];
              dzX =
                prevLayout.x +
                prevLayout.width +
                (NODE_SPACING - DROP_ZONE_WIDTH) / 2;
              dzY = Math.min(prevLayout.y, nextLayout.y);
            }

            return (
              <DropZone
                key={`dz-${i}`}
                x={dzX}
                y={dzY}
                width={DROP_ZONE_WIDTH}
                height={NODE_HEIGHT}
                isActive={activeDropIndex === i}
                onDragOver={(e) => handleDropZoneDragOver(e, i)}
                onDragLeave={handleDropZoneDragLeave}
                onDrop={(e) => handleDropZoneDrop(e, i)}
              />
            );
          })}

        {/* Non-drag "+" drop zones between nodes (always visible) */}
        {!isDraggingFromDrawer &&
          chain.nodes.length > 0 &&
          Array.from({ length: chain.nodes.length + 1 }, (_, i) => {
            let dzX: number;
            let dzY: number;

            if (i === 0) {
              dzX = CANVAS_PADDING_X - DROP_ZONE_WIDTH - 4;
              dzY = svgHeight / 2 - NODE_HEIGHT / 2;
            } else if (i === chain.nodes.length) {
              const lastLayout = nodeLayouts[nodeLayouts.length - 1];
              dzX = lastLayout
                ? lastLayout.x + lastLayout.width + 10
                : CANVAS_PADDING_X;
              dzY = svgHeight / 2 - NODE_HEIGHT / 2;
            } else {
              const prevLayout = nodeLayouts[i - 1];
              const nextLayout = nodeLayouts[i];
              dzX =
                prevLayout.x +
                prevLayout.width +
                (NODE_SPACING - DROP_ZONE_WIDTH) / 2;
              dzY = Math.min(prevLayout.y, nextLayout.y);
            }

            return (
              <DropZone
                key={`dz-add-${i}`}
                x={dzX}
                y={dzY}
                width={DROP_ZONE_WIDTH}
                height={NODE_HEIGHT}
                isActive={activeDropIndex === i}
                onDragOver={(e) => handleDropZoneDragOver(e, i)}
                onDragLeave={handleDropZoneDragLeave}
                onDrop={(e) => handleDropZoneDrop(e, i)}
              />
            );
          })}

        {/* Nodes */}
        {chain.nodes.map((node, i) => {
          const layout = nodeLayouts[i];
          if (!layout) return null;

          const { label, subLabel } = nodeLabels[i] ?? {
            label: "Unknown",
            subLabel: undefined,
          };
          const connectors = nodeConnectors[i];
          const compat = nodeCompatibility[i];
          const nodePerf = getNodePerformance(i);

          // Feedline run nodes use the expanded component
          if (node.type === "feedline_run") {
            const run = chain.feedlineRuns.find(
              (r) => r.id === node.feedlineRunId,
            );
            if (run) {
              const runData = feedlineRunData.get(run.id);
              return (
                <FeedlineRunNode
                  key={`node-${i}`}
                  feedlineRun={run}
                  feedlineLabel={label}
                  feedlineSubLabel={subLabel}
                  inlineLabels={runData?.inlineLabels ?? []}
                  totalLossDb={runData?.totalLossDb}
                  nodePerformance={nodePerf}
                  inputConnector={connectors?.input ?? null}
                  outputConnector={connectors?.output ?? null}
                  inputCompatible={compat?.inputCompatible}
                  outputCompatible={compat?.outputCompatible}
                  isSelected={selectedNodeIndex === i}
                  x={layout.x}
                  y={layout.y}
                  width={layout.width}
                  onClick={() => onSelectNode(i)}
                />
              );
            }
          }

          return (
            <ChainNode
              key={`node-${i}`}
              node={node}
              label={label}
              subLabel={subLabel}
              nodePerformance={nodePerf}
              inputConnector={connectors?.input ?? null}
              outputConnector={connectors?.output ?? null}
              inputCompatible={compat?.inputCompatible}
              outputCompatible={compat?.outputCompatible}
              isSelected={selectedNodeIndex === i}
              x={layout.x}
              y={layout.y}
              width={layout.width}
              height={layout.height}
              onClick={() => onSelectNode(i)}
              onDragStart={(e) => handleNodeDragStart(e, i)}
            />
          );
        })}
      </svg>
    </div>
  );
}
