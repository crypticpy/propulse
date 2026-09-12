import { useShackStore } from "@/stores/shackStore";
import { computeInsertPosition } from "@/lib/chainOrdering";
import {
  MAX_CHAIN_NODES,
  type ChainNode,
  type StationChain,
} from "@/types/stationChain";
import type { UserFeedline } from "@/types/shack";

export type AddPathEquipmentResult =
  | { ok: true }
  | { ok: false; error: string }
  | {
      ok: false;
      needsRunSelection: true;
      runOptions: Array<{ id: string; name: string }>;
    };

type InlineTargetResolution =
  | { status: "resolved"; runId: string }
  | { status: "ambiguous"; runIds: string[] }
  | { status: "missing" }
  | { status: "invalid" };

/** Adjacent feedline_run nodes for a canvas gap index (insert before `position`). */
export function collectAdjacentFeedlineRunIds(
  nodes: ChainNode[],
  position: number,
): Set<string> {
  const adjacent = new Set<string>();
  if (position > 0) {
    const before = nodes[position - 1];
    if (before?.type === "feedline_run") {
      adjacent.add(before.feedlineRunId);
    }
  }
  if (position < nodes.length) {
    const after = nodes[position];
    if (after?.type === "feedline_run") {
      adjacent.add(after.feedlineRunId);
    }
  }
  return adjacent;
}

/** Resolve which feedline run should receive inline gear for a drop or command. */
export function resolveInlineTargetRun(
  chain: StationChain,
  position?: number,
  feedlineRunId?: string,
): InlineTargetResolution {
  if (feedlineRunId) {
    if (!chain.feedlineRuns.some((run) => run.id === feedlineRunId)) {
      return { status: "invalid" };
    }
    return { status: "resolved", runId: feedlineRunId };
  }

  if (chain.feedlineRuns.length === 0) {
    return { status: "missing" };
  }

  if (position === undefined) {
    if (chain.feedlineRuns.length === 1) {
      return { status: "resolved", runId: chain.feedlineRuns[0].id };
    }
    return {
      status: "ambiguous",
      runIds: chain.feedlineRuns.map((run) => run.id),
    };
  }

  const adjacent = collectAdjacentFeedlineRunIds(chain.nodes, position);
  if (adjacent.size === 1) {
    return { status: "resolved", runId: [...adjacent][0] };
  }
  if (adjacent.size > 1) {
    return { status: "ambiguous", runIds: [...adjacent] };
  }

  return {
    status: "ambiguous",
    runIds: chain.feedlineRuns.map((run) => run.id),
  };
}

export function feedlineRunDisplayName(
  runId: string,
  chain: StationChain,
  feedlines: UserFeedline[],
): string {
  const run = chain.feedlineRuns.find((item) => item.id === runId);
  if (!run) return "Unknown cable run";
  const feedline = feedlines.find((item) => item.id === run.feedlineId);
  return feedline?.name ?? "Cable run";
}

function buildRunOptions(
  runIds: string[],
  chain: StationChain,
  feedlines: UserFeedline[],
): Array<{ id: string; name: string }> {
  return runIds.map((id) => ({
    id,
    name: feedlineRunDisplayName(id, chain, feedlines),
  }));
}

export function isInlineRunSelectionResult(
  result: AddPathEquipmentResult,
): result is Extract<
  AddPathEquipmentResult,
  { needsRunSelection: true }
> {
  return !result.ok && "needsRunSelection" in result && result.needsRunSelection;
}

/**
 * UI command adapter shared by canvas drop, gap/list picker, and Add to path.
 * An omitted position means automatic category ordering; an explicit position
 * is the selected gap and is never rewritten to canonical rank order.
 * Inline gear requires an explicit or unambiguous feedline run target.
 */
export function addPathEquipment(
  chainId: string,
  nodeType: string,
  equipmentId: string,
  position?: number,
  feedlineRunId?: string,
): AddPathEquipmentResult {
  const store = useShackStore.getState();
  const chain = store.stationChains.find((item) => item.id === chainId);
  if (!chain) return { ok: false, error: "Signal path no longer exists." };
  if (nodeType === "shack_accessory") {
    if (chain.shackAccessoryIds.includes(equipmentId))
      return {
        ok: false,
        error: "This equipment is already in the path's shack gear.",
      };
    return store.updateChain(chainId, {
      shackAccessoryIds: [...chain.shackAccessoryIds, equipmentId],
    });
  }
  if (nodeType === "inline") {
    const resolution = resolveInlineTargetRun(chain, position, feedlineRunId);
    if (resolution.status === "missing") {
      return {
        ok: false,
        error: "Add a feedline before adding an inline component.",
      };
    }
    if (resolution.status === "invalid") {
      return {
        ok: false,
        error:
          "That cable run is no longer in the path. Choose another run and try again.",
      };
    }
    if (resolution.status === "ambiguous") {
      return {
        ok: false,
        needsRunSelection: true,
        runOptions: buildRunOptions(
          resolution.runIds,
          chain,
          store.feedlines,
        ),
      };
    }

    const run = chain.feedlineRuns.find((item) => item.id === resolution.runId);
    if (!run) {
      return {
        ok: false,
        error:
          "That cable run is no longer in the path. Choose another run and try again.",
      };
    }

    const runName = feedlineRunDisplayName(run.id, chain, store.feedlines);
    if (run.inlineComponentIds.includes(equipmentId)) {
      return {
        ok: false,
        error: `This component is already in ${runName}.`,
      };
    }
    return store.updateFeedlineRun(chainId, run.id, {
      inlineComponentIds: [...run.inlineComponentIds, equipmentId],
    });
  }
  if (chain.nodes.length >= MAX_CHAIN_NODES)
    return {
      ok: false,
      error: `A signal path can contain up to ${MAX_CHAIN_NODES} equipment positions.`,
    };
  if (
    position !== undefined &&
    (!Number.isInteger(position) ||
      position < 0 ||
      position > chain.nodes.length)
  ) {
    return {
      ok: false,
      error:
        "The selected gap is no longer available. Close this dialog and choose a gap again.",
    };
  }
  if (nodeType === "feedline") {
    if (position === undefined) {
      return store.addFeedlineRun(chainId, {
        feedlineId: equipmentId,
        inlineComponentIds: [],
      })
        ? { ok: true }
        : { ok: false, error: "The feedline could not be added. Try again." };
    }
    // Existing addFeedlineRun always auto-orders. A selected gap instead saves
    // its node and run together, with the same node limit, through updateChain.
    const run = {
      id: crypto.randomUUID(),
      feedlineId: equipmentId,
      inlineComponentIds: [],
    };
    const nodes = [...chain.nodes];
    nodes.splice(position, 0, { type: "feedline_run", feedlineRunId: run.id });
    return store.updateChain(chainId, {
      nodes,
      feedlineRuns: [...chain.feedlineRuns, run],
    });
  }
  let node: ChainNode;
  if (nodeType === "radio") node = { type: "radio", radioId: equipmentId };
  else if (nodeType === "antenna")
    node = { type: "antenna", antennaId: equipmentId };
  else if (nodeType === "accessory")
    node = { type: "accessory", accessoryId: equipmentId };
  else
    return {
      ok: false,
      error: "This equipment type cannot be added to the signal path.",
    };
  const category = (id: string) =>
    store.accessories.find((item) => item.id === id)?.category ?? null;
  return store.addNodeToChain(
    chainId,
    node,
    position ?? computeInsertPosition(chain.nodes, node, category),
  );
}
