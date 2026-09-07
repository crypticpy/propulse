import { useLayoutEffect, useState, type ReactNode } from "react";
import type { ViewBinding, ViewConfiguration } from "@/lib/views/contracts";
import {
  createViewRuntime,
  ownerNamespace,
  persistsWorkingSlot,
  registerRuntimeWriter,
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

function ViewProviderInstance({
  ownerId, slot, kind = "interactive", sourceView = null, displayId = null,
  seed, storage, children,
}: ViewProviderProps) {
  const namespace = ownerNamespace(ownerId);
  const [runtime] = useState(() => createViewRuntime({
    binding: {
      ownerId: ownerId && ownerId.length > 0 ? ownerId : namespace,
      slotId: slot,
      kind,
      sourceView,
      displayId,
    },
    seed,
    storage,
    storageNamespace: namespace,
    persistWorking: persistsWorkingSlot(kind),
  }));

  useLayoutEffect(() => {
    const release = registerRuntimeWriter(runtime);
    return () => {
      release();
      runtime.dispose();
    };
  }, [runtime]);

  return (
    <ViewRuntimeContext.Provider value={runtime}>
      {children}
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
