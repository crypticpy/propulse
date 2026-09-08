import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/authStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import { useSync } from "./useSync";

const calls = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), register: vi.fn(), bootstrap: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/sync", () => ({ SyncManager: { getInstance: () => calls } }));
vi.mock("@/lib/sync/modules", () => ({ registerAllModules: calls.register }));
vi.mock("./useViewLibrarySession", () => ({ useViewLibrarySession: calls.bootstrap }));
const user = { id: "account-a" } as User;
const session = { user, access_token: "synthetic-test-token" } as Session;
function ready(ownerId = user.id) {
  useViewLibrarySessionStore.setState({ epoch: {}, ownerId, phase: "ready" });
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ initialized: true, user, session });
  useViewLibrarySessionStore.setState({ epoch: null, ownerId: null, phase: "waiting", repository: null, message: null });
});
afterEach(cleanup);

it("starts account sync only after original settings capture is ready", () => {
  const hook = renderHook(useSync);
  expect(calls.bootstrap).toHaveBeenCalled();
  expect(calls.start).not.toHaveBeenCalled();
  act(() => useViewLibrarySessionStore.setState({ phase: "loading", ownerId: user.id, epoch: {} }));
  expect(calls.start).not.toHaveBeenCalled();
  act(() => ready());
  expect(calls.start).toHaveBeenCalledExactlyOnceWith(user.id);
  hook.unmount();
  expect(calls.stop).toHaveBeenCalledOnce();
});

it("does not sync an unavailable library or another owner's ready library", () => {
  ready("account-b");
  renderHook(useSync);
  expect(calls.start).not.toHaveBeenCalled();
  act(() => useViewLibrarySessionStore.setState({ ownerId: user.id, phase: "unavailable" }));
  expect(calls.start).not.toHaveBeenCalled();
});

it("cleans up and starts again during StrictMode replay", () => {
  ready();
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  const hook = renderHook(useSync, { wrapper });
  expect(calls.start).toHaveBeenCalledTimes(2);
  expect(calls.stop).toHaveBeenCalledOnce();
  hook.unmount();
  expect(calls.stop).toHaveBeenCalledTimes(2);
});

it("stops on sign-out and waits for the next account's captured library", () => {
  ready();
  renderHook(useSync);
  act(() => useAuthStore.setState({ session: null, user: null }));
  expect(calls.stop).toHaveBeenCalledOnce();
  const nextUser = { id: "account-b" } as User;
  act(() => useAuthStore.setState({ user: nextUser, session: { ...session, user: nextUser } }));
  expect(calls.start).toHaveBeenCalledTimes(1);
  act(() => ready(nextUser.id));
  expect(calls.start).toHaveBeenLastCalledWith(nextUser.id);
});

it("rechecks current library state after bootstrap effects invalidate a rendered ready state", () => {
  ready();
  calls.bootstrap.mockImplementationOnce(() => {
    // Simulate the inner bootstrap effect invalidating this auth session before sync starts.
    useViewLibrarySessionStore.setState({ phase: "loading" });
  });
  renderHook(useSync);
  expect(calls.start).not.toHaveBeenCalled();
});

it("invalidates synchronously before React cleans up an auth transition", () => {
  ready();
  renderHook(useSync);
  act(() => {
    useAuthStore.setState({ session: null, user: null });
    expect(calls.stop).toHaveBeenCalledOnce();
  });
  expect(calls.stop).toHaveBeenCalledOnce();
});
