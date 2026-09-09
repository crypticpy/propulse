import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import type { ViewLibraryBootstrapResult } from "@/lib/views/persistence/viewLibraryBootstrap";
import { useAuthStore } from "@/stores/authStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import { useViewLibrarySession } from "./useViewLibrarySession";

const services = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  repositories: [] as { dispose: ReturnType<typeof vi.fn>; flushPending: ReturnType<typeof vi.fn> }[],
  syncs: [] as { dispose: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn> }[],
  credentials: [] as (() => Promise<{ ownerId: string; accessToken: string } | null>)[],
}));
vi.mock("@/stores/authStore", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create(() => ({ initialized: false, user: null, session: null })) };
});
vi.mock("@/stores/mapStore", () => ({ LAYER_PRESETS: {} }));
vi.mock("@/lib/views/runtime/ids", () => ({ getAnonymousInstallId: () => "test-install" }));
vi.mock("@/lib/views/persistence/indexedLibrary", () => ({ IndexedViewLibrary: class {
  constructor(public ownerId: string) {}
} }));
vi.mock("@/lib/views/persistence/repository", () => ({ RevisionedViewRepository: class {
  dispose = vi.fn(); flushPending = vi.fn().mockResolvedValue(undefined);
  constructor() { services.repositories.push(this); }
} }));
vi.mock("@/lib/views/persistence/httpTransport", () => ({ HttpViewLibraryTransport: class {
  constructor(_owner: string, credentials: () => Promise<{ ownerId: string; accessToken: string } | null>) { services.credentials.push(credentials); }
} }));
vi.mock("@/lib/views/persistence/librarySync", () => ({ ViewLibrarySync: class {
  repository = { dispose: vi.fn(), flushPending: vi.fn().mockResolvedValue(undefined) };
  refresh = vi.fn().mockResolvedValue(undefined);
  dispose = vi.fn(() => this.repository.dispose());
  constructor() { services.repositories.push(this.repository); services.syncs.push(this); }
} }));
vi.mock("@/lib/views/persistence/viewLibraryBootstrap", () => ({ bootstrapViewLibrary: services.bootstrap }));

const ready: ViewLibraryBootstrapResult = { status: "ready", migration: "existing" };
function deferred() {
  let resolve!: (value: ViewLibraryBootstrapResult) => void;
  const promise = new Promise<ViewLibraryBootstrapResult>((done) => { resolve = done; });
  return { promise, resolve };
}
function account(id = "owner-a", token = "token-a") {
  const user = { id } as User;
  return { initialized: true, user, session: { user, access_token: token } as Session };
}
async function settle() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => {
  services.repositories.length = 0; services.syncs.length = 0; services.credentials.length = 0;
  services.bootstrap.mockReset().mockResolvedValue(ready);
  useAuthStore.setState({ initialized: false, user: null, session: null });
  useViewLibrarySessionStore.setState({ epoch: null, ownerId: null, phase: "waiting", repository: null, library: null, message: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("waits for initialized auth and bootstrap before publishing or refreshing an account library", async () => {
  const pending = deferred(); services.bootstrap.mockReturnValue(pending.promise);
  renderHook(() => useViewLibrarySession());
  expect(services.bootstrap).not.toHaveBeenCalled();
  act(() => useAuthStore.setState(account()));
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ ownerId: "owner-a", phase: "loading", repository: null, library: null });
  expect(services.syncs[0].refresh).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event("online")));
  expect(services.syncs[0].refresh).not.toHaveBeenCalled();
  pending.resolve(ready); await settle();
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ phase: "ready", repository: services.repositories[0] });
  expect(useViewLibrarySessionStore.getState().library?.ownerId).toBe("owner-a");
  expect(services.syncs[0].refresh).toHaveBeenCalledTimes(1);
  expect(services.repositories[0].flushPending).toHaveBeenCalledTimes(1);
});

it.each(["account", "token"] as const)("cannot publish a stale bootstrap or authenticate an old %s session", async (change) => {
  const old = deferred(); const current = deferred();
  services.bootstrap.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  useAuthStore.setState(account()); renderHook(() => useViewLibrarySession());
  const oldLifecycle = services.bootstrap.mock.calls[0][3];
  act(() => useAuthStore.setState(change === "account" ? account("owner-b", "token-b") : account("owner-a", "token-b")));
  const expectedOwner = change === "account" ? "owner-b" : "owner-a";
  expect(oldLifecycle.signal.aborted).toBe(true); expect(oldLifecycle.isActive()).toBe(false);
  expect(services.syncs[0].dispose).toHaveBeenCalledTimes(1);
  expect(await services.credentials[0]()).toBeNull();
  expect(await services.credentials[1]()).toEqual({ ownerId: expectedOwner, accessToken: "token-b" });
  old.resolve(ready); await settle();
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ ownerId: expectedOwner, phase: "loading", repository: null, library: null });
  expect(services.syncs[0].refresh).not.toHaveBeenCalled();
  current.resolve(ready); await settle();
  expect(useViewLibrarySessionStore.getState().repository).toBe(services.repositories[1]);
});

it("does not flush after an account refresh resolves in a replaced session", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  useAuthStore.setState(account()); renderHook(() => useViewLibrarySession());
  services.syncs[0].refresh.mockReturnValue(pending);
  await settle();
  expect(services.syncs[0].refresh).toHaveBeenCalledTimes(1);
  act(() => useAuthStore.setState(account("owner-b", "token-b"))); await settle();
  resolve(); await settle();
  expect(services.repositories[0].flushPending).not.toHaveBeenCalled();
  expect(useViewLibrarySessionStore.getState().ownerId).toBe("owner-b");
});

it("disposes StrictMode's replay and real unmount without late publication or event refresh", async () => {
  const first = deferred(); const second = deferred();
  services.bootstrap.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  useAuthStore.setState(account());
  const hook = renderHook(() => useViewLibrarySession(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
  expect(services.syncs).toHaveLength(2); expect(services.syncs[0].dispose).toHaveBeenCalledTimes(1);
  first.resolve(ready); second.resolve(ready); await settle();
  expect(services.syncs[0].refresh).not.toHaveBeenCalled(); expect(services.syncs[1].refresh).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(services.syncs[1].dispose).toHaveBeenCalledTimes(1);
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ phase: "waiting", repository: null, epoch: null });
  act(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
  await settle(); expect(services.syncs[1].refresh).toHaveBeenCalledTimes(1);
});

it("cannot revive after unmount while bootstrap is pending", async () => {
  const pending = deferred(); services.bootstrap.mockReturnValue(pending.promise);
  useAuthStore.setState(account()); const hook = renderHook(() => useViewLibrarySession());
  hook.unmount(); pending.resolve(ready); await settle();
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ phase: "waiting", repository: null });
  expect(services.syncs[0].refresh).not.toHaveBeenCalled();
});

it.each(["unavailable", "forbidden"] as const)("leaves %s bootstrap unavailable and never refreshes", async (status) => {
  services.bootstrap.mockResolvedValue({ status, message: "Migration not ready" });
  useAuthStore.setState(account()); renderHook(() => useViewLibrarySession()); await settle();
  act(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ phase: "unavailable", repository: null, message: "Migration not ready" });
  expect(services.syncs[0].refresh).not.toHaveBeenCalled();
});

it("uses a local anonymous repository and disposes it on sign-in", async () => {
  useAuthStore.setState({ initialized: true }); renderHook(() => useViewLibrarySession()); await settle();
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ ownerId: "anon:test-install", phase: "ready" });
  expect(services.syncs).toHaveLength(0);
  act(() => useAuthStore.setState(account())); await settle();
  expect(services.repositories[0].dispose).toHaveBeenCalledTimes(1);
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ ownerId: "owner-a", phase: "ready" });
});

it("retains the ready repository after a failed flush and retries on reconnect", async () => {
  useAuthStore.setState(account()); renderHook(() => useViewLibrarySession());
  services.repositories[0].flushPending.mockRejectedValueOnce(new Error("IndexedDB temporarily unavailable"));
  await settle();
  expect(services.repositories[0].flushPending).toHaveBeenCalledTimes(1);
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ phase: "ready", repository: services.repositories[0] });
  act(() => window.dispatchEvent(new Event("online"))); await settle();
  expect(services.syncs[0].refresh).toHaveBeenCalledTimes(2);
  expect(services.repositories[0].flushPending).toHaveBeenCalledTimes(2);
  expect(useViewLibrarySessionStore.getState()).toMatchObject({ phase: "ready", repository: services.repositories[0] });
});
