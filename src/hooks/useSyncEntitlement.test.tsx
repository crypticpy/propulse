import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useSyncEntitlement } from "./useSyncEntitlement";
import { useAuthStore } from "@/stores/authStore";
import type { Session } from "@supabase/supabase-js";

vi.mock("@/lib/api/authFetch", () => ({
  authHeaders: async () => ({}),
}));

function setSignedIn(userId: string | null) {
  if (!userId) {
    useAuthStore.setState({ user: null, session: null });
    return;
  }
  const user = { id: userId } as Session["user"];
  const session = { user, access_token: "token" } as Session;
  useAuthStore.setState({ user, session });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useSyncEntitlement", () => {
  beforeEach(() => {
    setSignedIn(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never fetches while signed out", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result, unmount } = renderHook(() => useSyncEntitlement(), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });

  it(
    "keys the query on the signed-in user id, so switching accounts never serves a " +
      "stale cached answer for the previous account (owner review, #698 fix round)",
    async () => {
      let currentAnswer = true;
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ sync: currentAnswer }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      setSignedIn("user-a");
      const { result, rerender, unmount } = renderHook(() => useSyncEntitlement(), {
        wrapper: makeWrapper(client),
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.sync).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Switch accounts: user B is not entitled. If the query key did not
      // include the user id, this would resolve instantly from user A's
      // cached { sync: true } entry instead of asking the server again.
      currentAnswer = false;
      setSignedIn("user-b");
      rerender();

      await waitFor(() => expect(result.current.data?.sync).toBe(false));
      expect(fetchMock).toHaveBeenCalledTimes(2);

      unmount();
      client.clear();
    },
  );

  it("disables the query the instant the user id is unset, even if isAuthenticated lags", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    setSignedIn("user-a");
    const { result, unmount } = renderHook(() => useSyncEntitlement(), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.fetchStatus).not.toBe("idle");

    setSignedIn(null);
    expect(result.current).toBeDefined();

    unmount();
    client.clear();
  });
});
