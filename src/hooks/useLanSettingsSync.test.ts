import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import { useAuthStore } from "@/stores/authStore";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import { pushSettingsToBridge, useLanSettingsSync } from "./useLanSettingsSync";
const backup = vi.hoisted(() => ({
  exportSettings: vi.fn(() => ({ version: 1 })),
  importSettings: vi.fn(() => ({ success: true })),
  validateBackup: vi.fn(() => ({ valid: true })),
}));
vi.mock("@/lib/utils/settingsBackup", () => backup);
const marker = (owner: string) => `propulse-lan-settings-applied:${encodeURIComponent(owner)}`;
const payload = { updatedAt: "2026-09-07T01:00:00Z", backup: { version: 1 } };
function response(value: unknown = payload) { return { ok: true, json: async () => value } as Response; }
function login(id = "owner-a", token = "token-a") {
  const user = { id } as User;
  useAuthStore.setState({ initialized: true, user, session: { user, access_token: token } as Session });
}
function ready(ownerId = "owner-a") {
  useViewLibrarySessionStore.setState({ ownerId, epoch: {}, phase: "ready", repository: null });
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  backup.importSettings.mockReturnValue({ success: true });
  backup.validateBackup.mockReturnValue({ valid: true });
  localStorage.clear(); login();
  useDataSourceStatus.setState({ connectivity: "lan" });
  useViewLibrarySessionStore.setState({ ownerId: null, epoch: null, phase: "waiting", repository: null });
  vi.stubGlobal("fetch", vi.fn(async () => response()));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("LAN settings startup and session boundary", () => {
  it("does not poll until capture is ready, including unavailable startup", async () => {
    const hook = renderHook(useLanSettingsSync);
    await settle(); expect(fetch).not.toHaveBeenCalled();
    act(() => useViewLibrarySessionStore.setState({ phase: "unavailable" }));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetch).not.toHaveBeenCalled();
    act(() => ready()); await settle();
    expect(backup.importSettings).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(marker("owner-a"))).toBe(payload.updatedAt);
    hook.unmount();
  });
  it("rejects stale JSON and aborts immediately when auth changes before library cleanup", async () => {
    let finish!: (data: unknown) => void;
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) } as Response);
    ready(); const hook = renderHook(useLanSettingsSync); await settle();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    act(() => login("owner-b", "token-b"));
    expect(signal?.aborted).toBe(true);
    await act(async () => finish(payload));
    expect(backup.importSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(marker("owner-a"))).toBeNull();
    hook.unmount();
  });
  it("rejects stale responses after unmount and aborts pending requests", async () => {
    let finish!: (data: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    ready(); const hook = renderHook(useLanSettingsSync);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    hook.unmount(); expect(signal?.aborted).toBe(true);
    finish(response()); await settle();
    expect(backup.importSettings).not.toHaveBeenCalled();
  });
  it("does not acknowledge failed imports, retries later, and ignores the old shared marker", async () => {
    localStorage.setItem("propulse-lan-settings-applied", payload.updatedAt);
    backup.importSettings.mockReturnValueOnce({ success: false });
    ready(); const hook = renderHook(useLanSettingsSync); await settle();
    expect(localStorage.getItem(marker("owner-a"))).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(backup.importSettings).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(marker("owner-a"))).toBe(payload.updatedAt);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(backup.importSettings).toHaveBeenCalledTimes(2);
    hook.unmount();
  });
  it("keeps markers separate for different owners", async () => {
    ready(); const hook = renderHook(useLanSettingsSync); await settle();
    act(() => { login("owner-b", "token-b"); ready("owner-b"); }); await settle();
    expect(backup.importSettings).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(marker("owner-a"))).toBe(payload.updatedAt);
    expect(localStorage.getItem(marker("owner-b"))).toBe(payload.updatedAt);
    hook.unmount();
  });
  it("rejects publication during unavailable startup without exporting or fetching", async () => {
    useViewLibrarySessionStore.setState({ phase: "unavailable" });
    await expect(pushSettingsToBridge()).rejects.toThrow("not ready");
    expect(fetch).not.toHaveBeenCalled(); expect(backup.exportSettings).not.toHaveBeenCalled();
  });
  it("aborts publication on token change and never acknowledges a late success", async () => {
    let finish!: (data: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    ready(); const pending = pushSettingsToBridge();
    const result = expect(pending).rejects.toThrow("session changed");
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    login("owner-a", "token-refreshed"); expect(signal?.aborted).toBe(true);
    finish(response({ updatedAt: payload.updatedAt })); await result;
    expect(localStorage.getItem(marker("owner-a"))).toBeNull();
  });
  it("publishes explicitly and acknowledges only its bound owner", async () => {
    ready(); await expect(pushSettingsToBridge()).resolves.toBe(payload.updatedAt);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ version: 1 }) });
    expect(localStorage.getItem(marker("owner-a"))).toBe(payload.updatedAt);
    expect(backup.importSettings).not.toHaveBeenCalled();
  });
});
