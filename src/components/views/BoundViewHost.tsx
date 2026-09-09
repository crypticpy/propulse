import { useEffect, type MutableRefObject, type ReactNode } from "react";
import { ViewProvider, type ViewProviderProps } from "./ViewProvider";
import { useViewRuntime } from "./ViewRuntimeContext";
import { useAuthStore } from "@/stores/authStore";

export type BoundViewHostProps = Omit<ViewProviderProps, "ownerId"> & {
  children: ReactNode;
};

/**
 * Production ViewProvider mount. Owner comes from the signed-in account, or
 * the anonymous install namespace when signed out. There is no global runtime.
 */
export function BoundViewHost({ children, ...props }: BoundViewHostProps) {
  const ownerId = useAuthStore((state) => state.user?.id ?? null);
  return (
    <ViewProvider ownerId={ownerId} {...props}>
      {children}
    </ViewProvider>
  );
}

/**
 * Lets a parent that owns keyboard shortcuts (outside this provider) clear
 * the bound selection. Mount inside BoundViewHost.
 */
export function BoundSelectionClear({
  clearRef,
}: {
  clearRef: MutableRefObject<(() => void) | null>;
}) {
  const runtime = useViewRuntime();
  useEffect(() => {
    clearRef.current = () => runtime.clearSelection();
    return () => {
      clearRef.current = null;
    };
  }, [clearRef, runtime]);
  return null;
}
