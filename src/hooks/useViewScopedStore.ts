import { useEffect, useMemo } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { createViewScopedStore, type ViewScopedStoreHandle } from "@/lib/views/runtime";

/**
 * Vanilla store + commands bound to this ViewProvider. Destroyed with the
 * runtime; never registered as a global active view.
 */
export function useViewScopedStore(): ViewScopedStoreHandle {
  const runtime = useViewRuntime();
  const radio = useOperatingMonitor();
  const handle = useMemo(() => createViewScopedStore(runtime), [runtime]);
  useEffect(() => () => handle.destroy(), [handle]);
  useEffect(() => {
    handle.setRadio(radio ? { band: radio.band, mode: radio.mode } : null);
  }, [handle, radio]);
  return handle;
}
