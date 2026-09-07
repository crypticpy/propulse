import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authStoreMocks = vi.hoisted(() => ({
  initialized: false,
  initialize: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      initialized: authStoreMocks.initialized,
      initialize: authStoreMocks.initialize,
    }),
  },
}));

const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ auth: { getSession: supabaseMocks.getSession } }),
}));

import { authHeaders, waitForAuthSession } from "@/lib/api/authFetch";

beforeEach(() => {
  authStoreMocks.initialized = false;
  authStoreMocks.initialize.mockReset();
  supabaseMocks.getSession.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForAuthSession", () => {
  it("resolves immediately when the auth store is already initialized", async () => {
    authStoreMocks.initialized = true;

    await waitForAuthSession();

    expect(authStoreMocks.initialize).not.toHaveBeenCalled();
  });
});

describe("authHeaders", () => {
  it("attaches the bearer token once a delayed session restore completes", async () => {
    let resolveInit!: () => void;
    authStoreMocks.initialize.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
    );
    supabaseMocks.getSession.mockResolvedValue({
      data: { session: { access_token: "tok-123" } },
    });

    const headersPromise = authHeaders();

    // Still waiting on the store's initialize() call — the token lookup
    // must not race ahead of session restore.
    await Promise.resolve();
    await Promise.resolve();
    expect(supabaseMocks.getSession).not.toHaveBeenCalled();

    resolveInit();
    const headers = await headersPromise;

    expect(supabaseMocks.getSession).toHaveBeenCalled();
    expect(headers).toEqual({ Authorization: "Bearer tok-123" });
  });

  it("falls through without a header for an anonymous session once the readiness timeout elapses", async () => {
    vi.useFakeTimers();
    // Simulates a stuck/never-resolving initialize() — the bounded timeout
    // must still let a genuinely anonymous request proceed.
    authStoreMocks.initialize.mockImplementation(
      () => new Promise<void>(() => {}),
    );
    supabaseMocks.getSession.mockResolvedValue({ data: { session: null } });

    const headersPromise = authHeaders();

    await vi.advanceTimersByTimeAsync(3_000);
    const headers = await headersPromise;

    expect(headers).toEqual({});
  });
});
