import { useLayoutEffect, useMemo, useRef } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { createViewScopedStore, type ViewScopedStoreHandle } from "@/lib/views/runtime";

/**
 * Vanilla store + commands bound to this ViewProvider. Destroyed with the
 * runtime; never registered as a global active view.
 *
 * Subscribe in layout setup and delay destroy until after StrictMode replay
 * (same generation-ref pattern as ViewProvider). Replay reuses the memoized
 * handle, so cleanup must not leave it permanently unsubscribed.
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
