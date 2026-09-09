import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * A focused check on the `useQuery` options object itself — cheaper than
 * driving a real fake-timer refetch or a simulated window-focus event, and
 * it still pins the exact regression the #698 fix-round review called out:
 * `staleTime` alone never refetches while the host stays mounted, so an
 * upgrade would never turn `sync` on and a downgrade would never turn it
 * off for an operator who just leaves the app open.
 */
const queryMocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => queryMocks);
vi.mock("@/lib/api/authFetch", () => ({ authHeaders: async () => ({}) }));
vi.mock("@/stores/authStore", () => ({
  selectIsAuthenticated: () => true,
  useAuthStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({ user: { id: "user-1" } }),
}));

import { useSyncEntitlement } from "./useSyncEntitlement";

describe("useSyncEntitlement options", () => {
  it("polls every 5 minutes and refetches on window focus, not staleTime alone", () => {
    renderHook(() => useSyncEntitlement());

    const options = queryMocks.useQuery.mock.calls[0][0] as {
      staleTime: number;
      refetchInterval: number;
      refetchOnWindowFocus: boolean;
    };
    expect(options.staleTime).toBe(5 * 60 * 1000);
    expect(options.refetchInterval).toBe(5 * 60 * 1000);
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});
