import type { ViewBinding } from "../contracts";
import type { ScopedViewRuntime } from "./createViewRuntime";

const writers = new Map<string, ScopedViewRuntime>();

export function runtimeWriterKey(binding: ViewBinding): string {
  return `${binding.ownerId}\0${binding.slotId}\0${binding.kind}`;
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
