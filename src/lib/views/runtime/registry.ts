import type { ViewBinding } from "../contracts";
import type { ScopedViewRuntime } from "./createViewRuntime";

const writers = new Map<string, ScopedViewRuntime>();

export type RuntimeWriterAddress = Pick<ViewBinding, "ownerId" | "slotId" | "kind">;

export function runtimeWriterKey(binding: RuntimeWriterAddress): string {
  return `${binding.ownerId}\0${binding.slotId}\0${binding.kind}`;
}

/**
 * The runtime currently holding one owner/slot/kind, when one is mounted.
 * Read-only lookup: it never registers, disposes, or creates a runtime, and
 * there is still no "active view" — the caller must already know the address
 * it means. Used by surfaces outside a map host (Settings) that commit into a
 * family slot and want a mounted host to pick the change up immediately
 * rather than on its next mount.
 */
export function getRuntimeWriter(binding: RuntimeWriterAddress): ScopedViewRuntime | null {
  return writers.get(runtimeWriterKey(binding)) ?? null;
}

/**
 * One mounted writer per owner/slot/kind. Remounts dispose the previous writer.
 * There is no getActiveRuntime / global current-view selector.
 */
export function registerRuntimeWriter(runtime: ScopedViewRuntime): () => void {
  const key = runtimeWriterKey(runtime.binding);
  const previous = writers.get(key);
  if (previous && previous !== runtime) previous.dispose();
  writers.set(key, runtime);
  return () => {
    if (writers.get(key) === runtime) writers.delete(key);
  };
}

export function registeredWriterCount(): number {
  return writers.size;
}
