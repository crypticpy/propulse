import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ViewBinding, ViewConfiguration } from "@/lib/views/contracts";
import {
  createViewRuntime,
  ownerNamespace,
  persistsWorkingSlot,
  registerRuntimeWriter,
  type ScopedViewRuntime,
  type ViewSlotId,
  type WorkingSlotStorage,
} from "@/lib/views/runtime";
import { ViewRuntimeContext } from "./ViewRuntimeContext";

export interface ViewProviderProps {
  ownerId: string | null;
  slot: ViewSlotId;
  kind?: ViewBinding["kind"];
  sourceView?: ViewBinding["sourceView"];
  displayId?: string | null;
  seed?: ViewConfiguration;
  storage?: WorkingSlotStorage;
  children: ReactNode;
}

function optionsFrom(props: ViewProviderProps) {
  const kind = props.kind ?? "interactive";
  const namespace = ownerNamespace(props.ownerId);
  return {
    binding: {
      ownerId: props.ownerId && props.ownerId.length > 0 ? props.ownerId : namespace,
      slotId: props.slot,
      kind,
      sourceView: props.sourceView ?? null,
      displayId: props.displayId ?? null,
    } satisfies ViewBinding,
    seed: props.seed,
    storage: props.storage,
    storageNamespace: namespace,
    persistWorking: persistsWorkingSlot(kind),
  };
}

function ViewProviderInstance(props: ViewProviderProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const generationRef = useRef(0);
  const [runtime, setRuntime] = useState<ScopedViewRuntime>(() => createViewRuntime(optionsFrom(props)));
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  useLayoutEffect(() => {
    const generation = ++generationRef.current;
    let current = runtimeRef.current;
    if (current.isDisposed()) {
      current = createViewRuntime(optionsFrom(propsRef.current));
      runtimeRef.current = current;
      setRuntime(current);
    }
    const release = registerRuntimeWriter(current);
    return () => {
      release();
      const instance = current;
      queueMicrotask(() => {
        // Compare the latest generation after StrictMode's simulated cleanup/replay.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- replay must observe the live generation
        if (generationRef.current !== generation) return;
        instance.dispose();
      });
    };
  }, [runtime]);

  return (
    <ViewRuntimeContext.Provider value={runtime}>
      {props.children}
    </ViewRuntimeContext.Provider>
  );
}

/** Scoped running view. Identity changes remount a fresh instanceId. */
export function ViewProvider(props: ViewProviderProps) {
  const kind = props.kind ?? "interactive";
  const namespace = ownerNamespace(props.ownerId);
  const identity = `${namespace}:${props.slot}:${kind}:${props.displayId ?? ""}:${props.sourceView?.id ?? ""}:${props.sourceView?.revision ?? ""}`;
  return <ViewProviderInstance key={identity} {...props} />;
}
