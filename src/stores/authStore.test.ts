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

import { useAuthStore } from "./authStore";

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
  it("subscribes before session retrieval and records password recovery", async () => {
    let listener: AuthListener | undefined;
    let resolveSession!: (value: {
      data: { session: Session | null };
    }) => void;

    authMocks.onAuthStateChange.mockImplementation((callback: AuthListener) => {
      listener = callback;
      return {
        data: {
          subscription: { unsubscribe: authMocks.unsubscribe },
        },
      };
    });
    authMocks.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );

    const initializing = useAuthStore.getState().initialize();

    expect(authMocks.onAuthStateChange).toHaveBeenCalledOnce();
    expect(authMocks.getSession).toHaveBeenCalledOnce();

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
  });
});
