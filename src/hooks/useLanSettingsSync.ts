/** Shared legacy settings are applied only after the original view capture is safe. */
import { useEffect } from "react";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import { useAuthStore } from "@/stores/authStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import {
  exportSettings,
  importSettings,
  validateBackup,
  type SettingsBackup,
} from "@/lib/utils/settingsBackup";

const ENDPOINT = "/api/bridge/settings";
const POLL_MS = 30_000;
const APPLIED_KEY = "propulse-lan-settings-applied";

/** A captured account/token and library epoch remain authoritative across awaits. */
function bindReadySession() {
  const library = useViewLibrarySessionStore.getState();
  const auth = useAuthStore.getState();
  const userId = auth.user?.id ?? null;
  const token = auth.session?.access_token ?? null;
  if (!auth.initialized || library.phase !== "ready" || !library.epoch || !library.ownerId ||
      (auth.session && userId ? library.ownerId !== userId : !library.ownerId.startsWith("anon:"))) return null;
  const controller = new AbortController();
  const marker = `${APPLIED_KEY}:${encodeURIComponent(library.ownerId)}`;
  const isActive = () => {
    const current = useViewLibrarySessionStore.getState();
    const currentAuth = useAuthStore.getState();
    return !controller.signal.aborted && current.phase === "ready" && current.epoch === library.epoch &&
      current.ownerId === library.ownerId && currentAuth.initialized &&
      currentAuth.session === auth.session && (currentAuth.user?.id ?? null) === userId &&
      (currentAuth.session?.access_token ?? null) === token;
  };
  const cancelIfChanged = () => { if (!isActive()) controller.abort(); };
  const unsubscribeLibrary = useViewLibrarySessionStore.subscribe(cancelIfChanged);
  const unsubscribeAuth = useAuthStore.subscribe(cancelIfChanged);
  return {
    marker, signal: controller.signal, isActive,
    dispose: () => { controller.abort(); unsubscribeLibrary(); unsubscribeAuth(); },
  };
}

function rememberApplied(marker: string, updatedAt: string) {
  try { localStorage.setItem(marker, updatedAt); }
  catch { /* The remote operation succeeded even if this device cannot retain its marker. */ }
}

/** Publish explicitly; unavailable startup never exports uncaptured legacy settings. */
export async function pushSettingsToBridge(): Promise<string> {
  const lifecycle = bindReadySession();
  if (!lifecycle) throw new Error("Settings are not ready to publish; view-library startup must finish first");
  try {
    const response = await fetch(ENDPOINT, {
      method: "PUT", signal: lifecycle.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportSettings()),
    });
    if (!response.ok) throw new Error(`Bridge rejected settings (${response.status})`);
    const { updatedAt } = (await response.json()) as { updatedAt: unknown };
    if (!lifecycle.isActive()) throw new Error("Settings session changed before publishing completed");
    if (typeof updatedAt !== "string" || !updatedAt) throw new Error("Bridge returned an invalid settings timestamp");
    rememberApplied(lifecycle.marker, updatedAt);
    return updatedAt;
  } finally {
    lifecycle.dispose();
  }
}

export function useLanSettingsSync(): void {
  const isLan = useDataSourceStatus((s) => s.connectivity === "lan");
  const phase = useViewLibrarySessionStore((s) => s.phase);
  const epoch = useViewLibrarySessionStore((s) => s.epoch);
  const ownerId = useViewLibrarySessionStore((s) => s.ownerId);
  const authSession = useAuthStore((s) => s.session);
  const userId = useAuthStore((s) => s.user?.id);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (!isLan) return;
    const lifecycle = bindReadySession();
    if (!lifecycle) return;
    let pulling = false;
    const pull = async () => {
      if (pulling || !lifecycle.isActive()) return;
      pulling = true;
      try {
        const response = await fetch(ENDPOINT, { signal: lifecycle.signal });
        if (!response.ok || !lifecycle.isActive()) return;
        const payload = (await response.json()) as { updatedAt: unknown; backup: unknown };
        if (!lifecycle.isActive() || typeof payload.updatedAt !== "string" || !payload.updatedAt || payload.backup == null) return;
        let applied: string | null = null;
        try { applied = localStorage.getItem(lifecycle.marker); } catch { /* Import remains available without a marker. */ }
        if (applied === payload.updatedAt) return;
        const check = validateBackup(payload.backup);
        if (!check.valid || !lifecycle.isActive()) return;
        const result = importSettings(payload.backup as SettingsBackup);
        if (result.success && lifecycle.isActive()) rememberApplied(lifecycle.marker, payload.updatedAt);
      } catch {
        // Unavailable bridge or import: retry on a later poll, without acknowledging it.
      } finally {
        pulling = false;
      }
    };
    void pull();
    const id = setInterval(() => void pull(), POLL_MS);
    return () => { clearInterval(id); lifecycle.dispose(); };
  }, [isLan, phase, epoch, ownerId, authSession, userId, initialized]);
}
