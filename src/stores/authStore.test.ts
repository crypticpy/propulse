import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  setAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
    },
    realtime: {
      setAuth: authMocks.setAuth,
    },
  }),
}));

import { useAuthStore } from "@/stores/authStore";

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

function resetAuthState() {
  useAuthStore.getState().cleanup();
  useAuthStore.setState({
    user: null,
    session: null,
    initialized: false,
    loading: false,
    error: null,
    isRecoveryMode: false,
    sessionExpired: false,
  });
}

afterEach(() => {
  resetAuthState();
  vi.clearAllMocks();
});

describe("authStore.initialize", () => {
  it("orders initialization and manages the recovery lifecycle", async () => {
    const callOrder: string[] = [];
    let listener: AuthListener | undefined;
    let resolveSession!: (value: {
      data: { session: Session | null };
    }) => void;

    authMocks.onAuthStateChange.mockImplementation((callback: AuthListener) => {
      callOrder.push("onAuthStateChange");
      listener = callback;
      return {
        data: {
          subscription: { unsubscribe: authMocks.unsubscribe },
        },
      };
    });
    authMocks.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          callOrder.push("getSession");
          resolveSession = resolve;
        }),
    );

    const initializing = useAuthStore.getState().initialize();

    expect(authMocks.onAuthStateChange).toHaveBeenCalledOnce();
    expect(authMocks.getSession).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["onAuthStateChange", "getSession"]);

    const user = { id: "owner" } as Session["user"];
    const session = { user } as Session;
    resolveSession({ data: { session } });
    await initializing;

    listener?.("PASSWORD_RECOVERY", session);

    expect(useAuthStore.getState()).toMatchObject({
      user,
      session,
      initialized: true,
      isRecoveryMode: true,
    });

    // #698: Realtime authorization for the private account channel is kept
    // current off every auth event, not just sign-in.
    expect(authMocks.setAuth).toHaveBeenCalledWith(undefined);

    const signedInSession = { user, access_token: "token-1" } as Session;
    listener?.("SIGNED_IN", signedInSession);
    expect(authMocks.setAuth).toHaveBeenCalledWith("token-1");

    listener?.("SIGNED_OUT", null);

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      session: null,
      isRecoveryMode: false,
      sessionExpired: true,
    });
    expect(authMocks.setAuth).toHaveBeenLastCalledWith(undefined);
  });

  it("swallows a realtime.setAuth rejection rather than leaving it unhandled", async () => {
    let listener: AuthListener | undefined;
    authMocks.onAuthStateChange.mockImplementation((callback: AuthListener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: authMocks.unsubscribe } } };
    });
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    authMocks.setAuth.mockRejectedValueOnce(new Error("no realtime socket yet"));

    await useAuthStore.getState().initialize();

    const user = { id: "owner" } as Session["user"];
    const session = { user, access_token: "token-2" } as Session;
    // If this rejection were left unhandled, vitest would fail the test run
    // via an unhandledRejection, independent of any assertion below.
    listener?.("SIGNED_IN", session);
    await Promise.resolve();

    expect(authMocks.setAuth).toHaveBeenCalledWith("token-2");
  });
});
