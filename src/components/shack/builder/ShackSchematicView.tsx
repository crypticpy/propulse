/**
 * ShackSchematicView -- Read-only overview of ALL station chains on a single
 * zoomable / pannable SVG canvas. Chains are stacked vertically with labels,
 * reused ChainNode / FeedlineRunNode / ConnectionLine components, and a net
 * performance badge per chain.
 *
 * Clicking a chain row navigates back to Edit mode with that chain active.
 */

import React, {
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect,
} from "react";
import type { StationChain } from "@/types/stationChain";
import type { AccessoryCategory } from "@/types/shack";
import {
  FEEDLINE_TYPE_LABELS,
  ACCESSORY_CATEGORY_LABELS,
  ANTENNA_TYPE_LABELS,
} from "@/types/shack";
import { FEEDLINE_IMPEDANCE } from "@/lib/data/feedlines";
import {
  useShackStore,
  useStationChains,
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

// ─── Layout Constants ────────────────────────────────────────────────────────

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;
const FEEDLINE_NODE_WIDTH = 200;
const NODE_SPACING = 80;
const CHAIN_SPACING = 80;
const CHAIN_LABEL_WIDTH = 200;
const CANVAS_PADDING = 40;
const MIN_CANVAS_HEIGHT = 300;
const ERP_BADGE_WIDTH = 140;
const ERP_BADGE_HEIGHT = 54;

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLOR_GAIN = "#22C55E";
const COLOR_LOSS = "#EF4444";
const COLOR_BAND_COVERED = "#22C55E";
const COLOR_BAND_DIM = "#374151";
const COLOR_WEAKEST_LINK = "#EF4444";

// ─── Band constants ─────────────────────────────────────────────────────────

const BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
];

// ─── Helper: format watts for display ────────────────────────────────────────

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 10) return `${Math.round(w)}W`;
  return `${w.toFixed(1)}W`;
}

// ─── Per-chain row component (calls useChainPerformance per chain) ────────

interface ChainRowProps {
  chain: StationChain;
  offsetY: number;
  equipmentData: ChainEquipmentData;
  radios: ReturnType<typeof useUserRadios>;
  antennas: ReturnType<typeof useUserAntennas>;
  feedlines: ReturnType<typeof useUserFeedlines>;
  accessories: ReturnType<typeof useUserAccessories>;
  inlineComponents: ReturnType<typeof useInlineComponents>;
  selectedBand: string;
  onClick: () => void;
}

/** Compute the row height for a chain (for positioning later rows) */
function computeChainRowHeight(chain: StationChain): number {
  let maxNodeHeight = NODE_HEIGHT;
  for (const node of chain.nodes) {
    if (node.type === "feedline_run") {
      const run = chain.feedlineRuns.find((r) => r.id === node.feedlineRunId);
      const inlineCount = run ? run.inlineComponentIds.length : 0;
      const h = getFeedlineRunNodeHeight(inlineCount);
      if (h > maxNodeHeight) maxNodeHeight = h;
    }
  }
  // Add extra space for band pills row below the chain
  return maxNodeHeight + 28;
}

function ChainRow({
  chain,
  offsetY,
  equipmentData,
  radios,
  antennas,
  feedlines,
  accessories,
  inlineComponents,
  selectedBand,
  onClick,
}: ChainRowProps): React.ReactElement {
  // ── Performance data ──────────────────────────────────────────────────
  const perfResult = useChainPerformance(chain.id);
  const bandPerf = useMemo(() => {
    if (!selectedBand) return null;
    return perfResult.bands.find((b) => b.band === selectedBand) ?? null;
  }, [perfResult.bands, selectedBand]);

  // ── Connector compatibility ───────────────────────────────────────────
  const compatResults = useMemo(
    () => checkChainCompatibility(chain, equipmentData),
    [chain, equipmentData],
  );

  // ── Per-node connectors ───────────────────────────────────────────────
  const nodeConnectors = useMemo(() => {
    return chain.nodes.map((node) => ({
      input: getNodeInputConnector(node, equipmentData, chain),
      output: getNodeOutputConnector(node, equipmentData, chain),
    }));
  }, [chain, equipmentData]);

  // ── Resolve labels for each node ──────────────────────────────────────
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

  // ── Feedline run inline labels ────────────────────────────────────────
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

  // ── Accessory categories per node ─────────────────────────────────────
  const nodeAccessoryCategories = useMemo(() => {
    return chain.nodes.map((node): AccessoryCategory | undefined => {
      if (node.type === "accessory") {
        const acc = accessories.find((a) => a.id === node.accessoryId);
        return acc?.category;
      }
      return undefined;
    });
  }, [chain.nodes, accessories]);

  // ── Feedline impedance per run ────────────────────────────────────────
  const feedlineImpedances = useMemo(() => {
    const map = new Map<string, number>();
    for (const run of chain.feedlineRuns) {
      const fl = feedlines.find((f) => f.id === run.feedlineId);
      if (fl) map.set(run.id, FEEDLINE_IMPEDANCE[fl.feedlineType]);
    }
    return map;
  }, [chain.feedlineRuns, feedlines]);

  // ── Node compatibility (input/output edge) ───────────────────────────
  const nodeCompatibility = useMemo(() => {
    return chain.nodes.map((_, i) => {
      const inputResult = compatResults.find((r) => r.toIndex === i);
      const outputResult = compatResults.find((r) => r.fromIndex === i);
      return {
        inputCompatible: inputResult?.compatible,
        outputCompatible: outputResult?.compatible,
      };
    });
  }, [chain.nodes, compatResults]);

  // ── Per-node performance ──────────────────────────────────────────────
  const getNodePerformance = useCallback(
    (index: number): NodePerformance | undefined => {
      return bandPerf?.nodes.find((n) => n.nodeIndex === index);
    },
    [bandPerf],
  );

  // ── Find weakest link (most negative netDb) ───────────────────────────
  const weakestNodeIndex = useMemo(() => {
    if (!bandPerf || bandPerf.nodes.length === 0) return -1;
    let worstIdx = -1;
    let worstNet = Infinity;
    for (const np of bandPerf.nodes) {
      if (np.netDb < worstNet && np.netDb < 0) {
        worstNet = np.netDb;
        worstIdx = np.nodeIndex;
      }
    }
    return worstIdx;
  }, [bandPerf]);

  // ── Antenna bands for this chain ──────────────────────────────────────
  const antennaBands = useMemo(() => {
    const antennaNode = chain.nodes.find((n) => n.type === "antenna");
    if (!antennaNode || antennaNode.type !== "antenna") return [];
    const ant = antennas.find((a) => a.id === antennaNode.antennaId);
    return ant?.bands ?? [];
  }, [chain.nodes, antennas]);

  // ── Compute node layouts ──────────────────────────────────────────────
  interface NodeLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    isFeedlineRun: boolean;
  }

  const { nodeLayouts, rowHeight } = useMemo(() => {
    const layouts: NodeLayout[] = [];
    let curX = CHAIN_LABEL_WIDTH;
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
      if (i < chain.nodes.length - 1) {
        curX += NODE_SPACING;
      }
    }

    // Vertically center each node within the row
    for (const layout of layouts) {
      layout.y = offsetY + (maxHeight - layout.height) / 2;
    }

    return {
      nodeLayouts: layouts,
      rowHeight: maxHeight,
    };
  }, [chain.nodes, chain.feedlineRuns, offsetY]);

  // ── Net performance for the whole chain ───────────────────────────────
  const netSystemDb = bandPerf?.totalSystemGainDb ?? null;
  const netText =
    netSystemDb != null
      ? netSystemDb >= 0
        ? `+${netSystemDb.toFixed(1)} dB`
        : `${netSystemDb.toFixed(1)} dB`
      : null;
  const netColor =
    netSystemDb != null && netSystemDb >= 0 ? COLOR_GAIN : COLOR_LOSS;

  // ── ERP calculation ───────────────────────────────────────────────────
  const erpWatts = bandPerf?.erpWatts ?? null;
  const erpText = erpWatts != null ? formatWatts(erpWatts) : null;

  // Badge X position: after the last node + some spacing
  const badgeX =
    nodeLayouts.length > 0
      ? nodeLayouts[nodeLayouts.length - 1].x +
        nodeLayouts[nodeLayouts.length - 1].width +
        30
      : CHAIN_LABEL_WIDTH + 30;
  const badgeCenterY = offsetY + rowHeight / 2;

  // Power display
  const powerLabel =
    chain.operatingPowerWatts >= 1000
      ? `${(chain.operatingPowerWatts / 1000).toFixed(1)}kW`
      : `${chain.operatingPowerWatts}W`;

  // Band pills Y position (below all nodes)
  const bandPillsY = offsetY + rowHeight + 6;

  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      {/* Subtle row hover background */}
      <rect
        x={0}
        y={offsetY - 6}
        width={badgeX + ERP_BADGE_WIDTH + 20}
        height={rowHeight + 40}
        rx={12}
        fill="transparent"
        className="schematic-row-bg"
      />

      {/* ── Chain label column ─────────────────────────────────── */}
      <text
        x={CANVAS_PADDING}
        y={offsetY + rowHeight / 2 - 12}
        fill="#E5E7EB"
        fontSize={14}
        fontFamily="system-ui, sans-serif"
        fontWeight={700}
      >
        {chain.name.length > 20
          ? chain.name.slice(0, 19) + "\u2026"
          : chain.name}
      </text>

      {/* Power badge below name */}
      <rect
        x={CANVAS_PADDING}
        y={offsetY + rowHeight / 2}
        width={40}
        height={18}
        rx={9}
        fill="rgba(249,115,22,0.12)"
        stroke="rgba(249,115,22,0.3)"
        strokeWidth={0.5}
      />
      <text
        x={CANVAS_PADDING + 20}
        y={offsetY + rowHeight / 2 + 9}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#F97316"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        fontWeight={600}
      >
        {powerLabel}
      </text>

      {/* Node count below power */}
      <text
        x={CANVAS_PADDING}
        y={offsetY + rowHeight / 2 + 26}
        fill="#6B7280"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
      >
        {chain.nodes.length} node{chain.nodes.length !== 1 ? "s" : ""}
      </text>

      {/* ── Band coverage pills (below chain label) ──────────── */}
      {antennaBands.length > 0 && (
        <g>
          {BANDS.map((band, bi) => {
            const isCovered = antennaBands.includes(band);
            const pillW = band.length > 3 ? 32 : 26;
            const pillX = CANVAS_PADDING + bi * (pillW + 3);
            return (
              <g key={`band-pill-${chain.id}-${band}`}>
                <rect
                  x={pillX}
                  y={bandPillsY}
                  width={pillW}
                  height={14}
                  rx={4}
                  fill={
                    isCovered ? "rgba(34,197,94,0.15)" : "rgba(55,65,81,0.3)"
                  }
                  stroke={isCovered ? COLOR_BAND_COVERED : COLOR_BAND_DIM}
                  strokeWidth={0.5}
                />
                <text
                  x={pillX + pillW / 2}
                  y={bandPillsY + 7}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isCovered ? COLOR_BAND_COVERED : "#6B7280"}
                  fontSize={8}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={isCovered ? 600 : 400}
                >
                  {band}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── Connection lines between adjacent nodes ──────────── */}
      {compatResults.map((result) => {
        const fromLayout = nodeLayouts[result.fromIndex];
        const toLayout = nodeLayouts[result.toIndex];
        if (!fromLayout || !toLayout) return null;

        const fromX = fromLayout.x + fromLayout.width;
        const fromY = fromLayout.y + fromLayout.height / 2;
        const toX = toLayout.x;
        const toY = toLayout.y + toLayout.height / 2;

        // Pass loss/gain from destination node's performance (change #2)
        const destPerf = getNodePerformance(result.toIndex);
        let connLossDb: number | undefined;
        let connGainDb: number | undefined;
        if (destPerf) {
          if (destPerf.netDb < 0) {
            connLossDb = Math.abs(destPerf.netDb);
          } else if (destPerf.netDb > 0) {
            connGainDb = destPerf.netDb;
          }
        }

        return (
          <g
            key={`conn-group-${chain.id}-${result.fromIndex}-${result.toIndex}`}
          >
            <ConnectionLine
              fromX={fromX}
              fromY={fromY}
              toX={toX}
              toY={toY}
              compatible={result.compatible}
              lossDb={connLossDb}
              gainDb={connGainDb}
            />
            {/* Power annotation below the connection line (change #4) */}
            {destPerf && (
              <text
                x={(fromX + toX) / 2}
                y={Math.max(fromY, toY) + 18}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#9CA3AF"
                fontSize={9}
                fontFamily="system-ui, sans-serif"
                fontWeight={500}
              >
                {formatWatts(destPerf.inputPowerWatts)}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Nodes ────────────────────────────────────────────── */}
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
        const isWeakestLink = i === weakestNodeIndex;

        // Feedline run nodes use the expanded component
        if (node.type === "feedline_run") {
          const run = chain.feedlineRuns.find(
            (r) => r.id === node.feedlineRunId,
          );
          if (run) {
            const runData = feedlineRunData.get(run.id);
            return (
              <g key={`snode-${chain.id}-${i}`}>
                {/* Weakest link highlight (change #8) */}
                {isWeakestLink && (
                  <rect
                    x={layout.x - 4}
                    y={layout.y - 4}
                    width={layout.width + 8}
                    height={layout.height + 8}
                    rx={14}
                    fill="none"
                    stroke={COLOR_WEAKEST_LINK}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    opacity={0.7}
                  >
                    <animate
                      attributeName="opacity"
                      values="0.4;0.9;0.4"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}
                <FeedlineRunNode
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
                  isSelected={false}
                  impedanceOhms={feedlineImpedances.get(run.id)}
                  x={layout.x}
                  y={layout.y}
                  width={layout.width}
                />
              </g>
            );
          }
        }

        return (
          <g key={`snode-${chain.id}-${i}`}>
            {/* Weakest link highlight (change #8) */}
            {isWeakestLink && (
              <rect
                x={layout.x - 4}
                y={layout.y - 4}
                width={layout.width + 8}
                height={layout.height + 8}
                rx={14}
                fill="none"
                stroke={COLOR_WEAKEST_LINK}
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.7}
              >
                <animate
                  attributeName="opacity"
                  values="0.4;0.9;0.4"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </rect>
            )}
            <ChainNode
              node={node}
              label={label}
              subLabel={subLabel}
              nodePerformance={nodePerf}
              inputConnector={connectors?.input ?? null}
              outputConnector={connectors?.output ?? null}
              inputCompatible={compat?.inputCompatible}
              outputCompatible={compat?.outputCompatible}
              isSelected={false}
              accessoryCategory={nodeAccessoryCategories[i]}
              x={layout.x}
              y={layout.y}
              width={layout.width}
              height={layout.height}
            />
            {/* Weakest link warning badge */}
            {isWeakestLink && nodePerf && (
              <g>
                <rect
                  x={layout.x + layout.width - 16}
                  y={layout.y - 8}
                  width={20}
                  height={16}
                  rx={4}
                  fill={COLOR_WEAKEST_LINK}
                />
                <text
                  x={layout.x + layout.width - 6}
                  y={layout.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#FFFFFF"
                  fontSize={10}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={700}
                >
                  !
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* ── ERP Badge (right side, bigger) ─ change #5 ─────── */}
      <g>
        <rect
          x={badgeX}
          y={badgeCenterY - ERP_BADGE_HEIGHT / 2}
          width={ERP_BADGE_WIDTH}
          height={ERP_BADGE_HEIGHT}
          rx={12}
          fill={
            netSystemDb != null && netSystemDb >= 0
              ? "rgba(34,197,94,0.12)"
              : "rgba(239,68,68,0.12)"
          }
          stroke={netColor}
          strokeWidth={1}
        />
        {/* ERP watts (large) */}
        {erpText && (
          <text
            x={badgeX + ERP_BADGE_WIDTH / 2}
            y={badgeCenterY - (netText ? 6 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={netColor}
            fontSize={16}
            fontFamily="system-ui, sans-serif"
            fontWeight={700}
          >
            {erpText} ERP
          </text>
        )}
        {/* Net dB (smaller, below) */}
        {netText && (
          <text
            x={badgeX + ERP_BADGE_WIDTH / 2}
            y={badgeCenterY + (erpText ? 12 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={netColor}
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            fontWeight={500}
            opacity={0.8}
          >
            {netText}
          </text>
        )}
        {/* Fallback: no performance data */}
        {!netText && !erpText && (
          <text
            x={badgeX + ERP_BADGE_WIDTH / 2}
            y={badgeCenterY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6B7280"
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            fontWeight={500}
          >
            Select band
          </text>
        )}
      </g>
    </g>
  );
}

// ─── Main ShackSchematicView component ─────────────────────────────────────

export interface ShackSchematicViewProps {
  /** Currently selected band for performance calculations */
  selectedBand: string;
  /** Callback when band selection changes */
  onSelectBand?: (band: string) => void;
  /** Callback when user clicks a chain row to switch to edit mode */
  onEditChain?: (chainId: string) => void;
  /** Callback when user wants to create a chain from empty state */
  onCreateChain?: () => void;
}

export function ShackSchematicView({
  selectedBand,
  onSelectBand,
  onEditChain,
  onCreateChain,
}: ShackSchematicViewProps) {
  const chains = useStationChains();
  const setActiveChain = useShackStore((s) => s.setActiveChain);

  // ── Store data (shared across all chain rows) ──────────────────────────
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineComponents = useInlineComponents();
  const storeRadios = useShackStore((s) => s.radios);
  const customRadios = useShackStore((s) => s.customRadios);

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

  // ── Zoom & pan state ───────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const panStartOffset = useRef({ x: 0, y: 0 });
  const didPan = useRef(false);
  const PAN_DEAD_ZONE = 3;

  // ── Compute per-chain Y offsets and total canvas size ──────────────────
  const { chainOffsets, svgWidth, svgHeight } = useMemo(() => {
    const offsets: number[] = [];
    let curY = CANVAS_PADDING + 40; // Extra space for band selector row
    let maxWidth = 0;

    for (const chain of chains) {
      offsets.push(curY);
      const rowHeight = computeChainRowHeight(chain);

      // Compute width for this chain
      let curX = CHAIN_LABEL_WIDTH;
      for (let i = 0; i < chain.nodes.length; i++) {
        const node = chain.nodes[i];
        const isFeedline = node.type === "feedline_run";
        curX += isFeedline ? FEEDLINE_NODE_WIDTH : NODE_WIDTH;
        if (i < chain.nodes.length - 1) curX += NODE_SPACING;
      }
      // Add space for ERP badge
      curX += ERP_BADGE_WIDTH + 60;

      if (curX > maxWidth) maxWidth = curX;
      curY += rowHeight + CHAIN_SPACING;
    }

    const totalWidth = Math.max(maxWidth + CANVAS_PADDING, 600);
    const totalHeight = Math.max(curY + CANVAS_PADDING, MIN_CANVAS_HEIGHT);

    return {
      chainOffsets: offsets,
      svgWidth: totalWidth,
      svgHeight: totalHeight,
    };
  }, [chains]);

  // ── Container ref for measuring available width ────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Native wheel event listener for zoom ──────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();

      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setZoom((prev) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const next = Math.min(2.5, Math.max(0.3, prev + delta));
        const s = next / prev;
        setPanOffset((p) => ({
          x: mx - s * (mx - p.x),
          y: my - s * (my - p.y),
        }));
        return next;
      });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pan handlers (mouse drag on background) ──────────────────────────
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement;
      if (
        target === e.currentTarget ||
        target.tagName === "svg" ||
        target.classList.contains("canvas-bg")
      ) {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        panStartOffset.current = { x: panOffset.x, y: panOffset.y };
        didPan.current = false;
        e.preventDefault();
      }
    },
    [panOffset],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      if (!didPan.current && Math.sqrt(dx * dx + dy * dy) < PAN_DEAD_ZONE)
        return;
      didPan.current = true;
      setPanOffset({
        x: panStartOffset.current.x + dx,
        y: panStartOffset.current.y + dy,
      });
    },
    [isPanning, panStart],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // ── Zoom to fit ──────────────────────────────────────────────────────
  const handleZoomToFit = useCallback(() => {
    if (containerWidth <= 0 || svgWidth <= 0) return;
    const fitZoomX = containerWidth / svgWidth;
    const fitZoomY = containerHeight > 0 ? containerHeight / svgHeight : 1;
    const fitZoom = Math.min(fitZoomX, fitZoomY, 1);
    setZoom(Math.max(0.3, fitZoom));
    setPanOffset({ x: 0, y: 0 });
  }, [containerWidth, containerHeight, svgWidth, svgHeight]);

  // ── Click chain row ──────────────────────────────────────────────────
  const handleChainClick = useCallback(
    (chainId: string) => {
      if (didPan.current) return;
      setActiveChain(chainId);
      onEditChain?.(chainId);
    },
    [setActiveChain, onEditChain],
  );

  // ── Empty state (change #7) ────────────────────────────────────────────
  if (chains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-plasma-orange/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-200 mb-2">
          No station chains yet
        </h3>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          Build your station&apos;s signal path from radio to antenna. Map out
          each chain like a QST magazine station diagram.
        </p>
        {onCreateChain && (
          <button
            type="button"
            onClick={onCreateChain}
            className="
              flex items-center gap-2 px-5 py-2.5
              bg-plasma-orange/15 border border-plasma-orange/30
              rounded-xl text-plasma-orange text-sm font-semibold
              hover:bg-plasma-orange/25 hover:border-plasma-orange/50
              transition-all duration-200
            "
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
            Create Your First Chain
          </button>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const displayHeight = Math.max(svgHeight * zoom, MIN_CANVAS_HEIGHT);

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl bg-panel/30 backdrop-blur-sm border border-white/5 overflow-hidden select-none"
      style={{
        cursor: isPanning ? "grabbing" : "grab",
        minHeight: MIN_CANVAS_HEIGHT,
      }}
    >
      {/* Zoom controls overlay (top-right) */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setZoom((prev) => Math.min(2.5, prev + 0.2))}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-white/10 text-sm font-bold"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="text-[10px] text-gray-500 font-mono w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((prev) => Math.max(0.3, prev - 0.2))}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-white/10 text-sm font-bold"
          aria-label="Zoom out"
        >
          {"\u2212"}
        </button>
        <div className="w-px h-4 bg-white/10 mx-0.5" />
        <button
          type="button"
          onClick={handleZoomToFit}
          className="px-1.5 h-7 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-white/10 text-[10px] font-medium"
          aria-label="Zoom to fit"
        >
          Fit
        </button>
      </div>

      {/* Title badge (top-left) */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-void-black/60 backdrop-blur-sm border border-white/10 rounded-lg">
        <svg
          className="w-3.5 h-3.5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
        <span className="text-[10px] text-gray-400 font-medium">
          {chains.length} chain{chains.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Band selector strip (change #3) */}
      {onSelectBand && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-lg px-1.5 py-1">
          {BANDS.map((band) => (
            <button
              key={band}
              type="button"
              onClick={() => onSelectBand(band)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                selectedBand === band
                  ? "bg-plasma-orange text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/10"
              }`}
            >
              {band}
            </button>
          ))}
        </div>
      )}

      {/* Hint badge (bottom-left) */}
      <div className="absolute bottom-2 left-2 z-10 px-2.5 py-1 bg-void-black/60 backdrop-blur-sm border border-white/10 rounded-lg">
        <span className="text-[10px] text-gray-500">Click a chain to edit</span>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={displayHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ minHeight: MIN_CANVAS_HEIGHT }}
        role="img"
        aria-label="Shack schematic overview"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Background rect for pan interactions */}
        <rect
          className="canvas-bg"
          x={0}
          y={0}
          width={svgWidth}
          height={svgHeight}
          fill="transparent"
        />

        <g
          transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}
        >
          {/* Subtle horizontal dividers between chains */}
          {chains.map((chain, idx) => {
            if (idx === 0) return null;
            const y = chainOffsets[idx] - CHAIN_SPACING / 2;
            return (
              <line
                key={`div-${chain.id}`}
                x1={CANVAS_PADDING}
                y1={y}
                x2={svgWidth - CANVAS_PADDING}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
                strokeDasharray="8 6"
              />
            );
          })}

          {/* Chain rows */}
          {chains.map((chain, idx) => (
            <ChainRow
              key={chain.id}
              chain={chain}
              offsetY={chainOffsets[idx]}
              equipmentData={equipmentData}
              radios={radios}
              antennas={antennas}
              feedlines={feedlines}
              accessories={accessories}
              inlineComponents={inlineComponents}
              selectedBand={selectedBand}
              onClick={() => handleChainClick(chain.id)}
            />
          ))}
        </g>
      </svg>

      {/* CSS for hover effect on rows */}
      <style>{`
        .schematic-row-bg {
          transition: fill 0.15s ease;
        }
        g:hover > .schematic-row-bg {
          fill: rgba(255,255,255,0.02);
        }
      `}</style>
    </div>
  );
}
