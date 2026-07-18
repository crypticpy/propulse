import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
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

    listener?.("SIGNED_OUT", null);

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      session: null,
      isRecoveryMode: false,
      sessionExpired: true,
    });
  });
});
