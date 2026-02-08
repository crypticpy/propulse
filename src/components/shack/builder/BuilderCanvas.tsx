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
const MIN_CANVAS_HEIGHT = 200;

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

  // ── Render ──────────────────────────────────────────────────────────────

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

        {/* Empty state */}
        {chain.nodes.length === 0 && (
          <text
            x={svgWidth / 2}
            y={svgHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6B7280"
            fontSize={13}
            fontFamily="system-ui, sans-serif"
          >
            Drag equipment here to build your signal chain
          </text>
        )}
      </svg>
    </div>
  );
}
