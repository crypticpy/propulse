import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useAzimuthalMapSpots } from "./useAzimuthalMapSpots";

describe("useAzimuthalMapSpots", () => {
  it("requires a bound view instead of forwarding global map/DX filters", () => {
    expect(() =>
      renderHook(() =>
        useAzimuthalMapSpots({
          grid: "EM10aa",
          enabled: true,
          activationsEnabled: false,
        }),
      ),
    ).toThrow(/no global active view exists/);
  });

  it("mounts inside a bound view", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ViewProvider
          ownerId="owner-a"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          {children}
        </ViewProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useAzimuthalMapSpots({
          grid: "EM10aa",
          enabled: false,
          activationsEnabled: false,
        }),
      { wrapper },
    );
    expect(result.current.mapBudget).toBe(150);
  });
});
