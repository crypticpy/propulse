import { useLayoutEffect, useMemo, useRef } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { createViewScopedStore, type ViewScopedStoreHandle } from "@/lib/views/runtime";

/**
 * Vanilla store + commands bound to this ViewProvider. Destroyed with the
 * runtime; never registered as a global active view.
 *
 * The memoized handle is created without subscribing. Attach only in committed
 * layout setup so discarded StrictMode/suspended renders cannot leak. Destroy
 * is delayed with the same generation-ref pattern as ViewProvider.
 */
export function useViewScopedStore(): ViewScopedStoreHandle {
  const runtime = useViewRuntime();
  const radio = useOperatingMonitor();
  const handle = useMemo(() => createViewScopedStore(runtime), [runtime]);
  const generationRef = useRef(0);
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useLayoutEffect(() => {
    const generation = ++generationRef.current;
    handle.ensureSubscribed();
    const instance = handle;
    return () => {
      queueMicrotask(() => {
        // Compare the latest generation after StrictMode's simulated cleanup/replay.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- replay must observe the live generation
        if (generationRef.current !== generation) {
          if (handleRef.current !== instance) instance.destroy();
          return;
        }
        instance.destroy();
      });
    };
  }, [handle]);

  useLayoutEffect(() => {
    handle.setRadio(radio ? { band: radio.band, mode: radio.mode } : null);
  }, [handle, radio]);

  return handle;
}
