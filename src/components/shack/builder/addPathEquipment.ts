import { useShackStore } from "@/stores/shackStore";
import { computeInsertPosition } from "@/lib/chainOrdering";
import { MAX_CHAIN_NODES, type ChainNode } from "@/types/stationChain";

type Result = { ok: true } | { ok: false; error: string };

/** UI command adapter. An omitted position means automatic category ordering. */
export function addPathEquipment(
  chainId: string,
  nodeType: string,
  equipmentId: string,
  position?: number,
): Result {
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
    // Legacy shelf drags target the first run; explicit inline-run selection
    // remains a separate workbench requirement. Gap pickers do not offer inline gear.
    const run = chain.feedlineRuns[0];
    if (!run)
      return {
        ok: false,
        error: "Add a feedline before adding an inline component.",
      };
    if (run.inlineComponentIds.includes(equipmentId))
      return {
        ok: false,
        error: "This component is already in the first cable run.",
      };
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
