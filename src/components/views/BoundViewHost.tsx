import type { ReactNode } from "react";
import { ViewProvider, type ViewProviderProps } from "./ViewProvider";
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
