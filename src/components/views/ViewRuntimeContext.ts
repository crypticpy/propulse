import { createContext, useContext } from "react";
import type { ScopedViewRuntime } from "@/lib/views/runtime";

export const ViewRuntimeContext = createContext<ScopedViewRuntime | null>(null);

/** Throws when no provider is mounted. There is no singleton runtime fallback. */
export function useViewRuntime(): ScopedViewRuntime {
  const runtime = useContext(ViewRuntimeContext);
  if (!runtime) {
    throw new Error("useViewRuntime requires ViewProvider; no global active view exists");
  }
  return runtime;
}

export function useOptionalViewRuntime(): ScopedViewRuntime | null {
  return useContext(ViewRuntimeContext);
}
