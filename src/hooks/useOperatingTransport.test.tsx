import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #698 gating: signed out, unentitled, or "Follow my other screens" off must
 * never open the account transport. `useSyncEntitlement` is mocked (its own
 * fetch/React Query plumbing is covered separately) so the test controls
 * `sync` directly; the real `authStore` / `operatingStateStore` singletons
 * drive the other two conditions, exactly like the app does.
 */
const syncState = vi.hoisted(() => ({ data: undefined as { sync: boolean } | undefined }));
vi.mock("@/hooks/useSyncEntitlement", () => ({
  useSyncEntitlement: () => ({ data: syncState.data }),
}));

const supabaseFake = vi.hoisted(() => {
  const channels: { unsubscribeCalls: number }[] = [];
  function makeChannelStub() {
    const record = { unsubscribeCalls: 0 };
    channels.push(record);
    const stub = {
      on: () => stub,
      subscribe: () => stub,
      send: async () => ({ ok: true }),
      unsubscribe: async () => {
        record.unsubscribeCalls += 1;
        return "ok" as const;
      },
    };
    return stub;
  }
  const channelSpy = vi.fn(() => makeChannelStub());
  return { channelSpy, channels, client: { channel: channelSpy } };
});
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => supabaseFake.client,
}));

import type { Session } from "@supabase/supabase-js";
import { useOperatingTransport } from "./useOperatingTransport";
import { useAuthStore } from "@/stores/authStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

function setSignedIn(userId: string | null) {
  act(() => {
    if (!userId) {
      useAuthStore.setState({ user: null, session: null });
      return;
    }
    const user = { id: userId } as Session["user"];
    const session = { user, access_token: "token" } as Session;
    useAuthStore.setState({ user, session });
  });
}

beforeEach(() => {
  localStorage.clear();
  syncState.data = undefined;
  supabaseFake.channelSpy.mockClear();
  supabaseFake.channels.length = 0;
  setSignedIn(null);
  act(() => {
    useOperatingStateStore.setState({ followScreens: true });
  });
});

describe("useOperatingTransport account-channel gating", () => {
  it("never opens the account channel while signed out, even with sync true", () => {
    syncState.data = { sync: true };
    const { unmount } = renderHook(() => useOperatingTransport());
    expect(supabaseFake.channelSpy).not.toHaveBeenCalled();
    unmount();
  });

  it("never opens the account channel for an unentitled signed-in user", () => {
    setSignedIn("user-1");
    syncState.data = { sync: false };
    const { unmount } = renderHook(() => useOperatingTransport());
    expect(supabaseFake.channelSpy).not.toHaveBeenCalled();
    unmount();
  });

  it("opens a channel named for the account when signed in, entitled, and following", () => {
    setSignedIn("user-1");
    syncState.data = { sync: true };
    const { unmount } = renderHook(() => useOperatingTransport());
    expect(supabaseFake.channelSpy).toHaveBeenCalledWith(
      "operating:user-1",
      expect.objectContaining({ config: { private: true, broadcast: { self: false } } }),
    );
    unmount();
  });

  it("closes the account channel when the kill switch turns off", () => {
    setSignedIn("user-1");
    syncState.data = { sync: true };
    const { rerender, unmount } = renderHook(() => useOperatingTransport());
    expect(supabaseFake.channelSpy).toHaveBeenCalledTimes(1);
    const opened = supabaseFake.channels[0];

    act(() => {
      useOperatingStateStore.getState().setFollowScreens(false);
    });
    rerender();

    // The effect's cleanup unsubscribed the channel it opened, and no
    // replacement account channel is opened once followScreens is off.
    expect(opened.unsubscribeCalls).toBeGreaterThan(0);
    expect(supabaseFake.channelSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("opens the account channel once sync flips true for an already signed-in, following user", () => {
    setSignedIn("user-2");
    syncState.data = { sync: false };
    const { rerender, unmount } = renderHook(() => useOperatingTransport());
    expect(supabaseFake.channelSpy).not.toHaveBeenCalled();

    act(() => {
      syncState.data = { sync: true };
    });
    rerender();

    expect(supabaseFake.channelSpy).toHaveBeenCalledWith(
      "operating:user-2",
      expect.objectContaining({ config: { private: true, broadcast: { self: false } } }),
    );
    unmount();
  });
});
