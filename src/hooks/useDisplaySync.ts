import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useDisplayStore,
  type DisplaySceneConfig,
} from "@/stores/displayStore";
import { useKioskStore, DEFAULT_SCENES } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

const POLL_INTERVAL_MS = 20_000;

interface DisplayStateResponse {
  paired: boolean;
  name: string | null;
  sceneConfig: DisplaySceneConfig | null;
  updatedAt: string;
}

/**
 * useDisplaySync — device-side sync engine for a paired Display Wall device.
 *
 * Mounted once in Layout; a no-op unless a display identity is persisted
 * AND `syncActive` is set (DisplayPairPage/DisplayViewPage turn this on
 * once the device is paired). Poll is truth: GET /api/displays/state runs
 * immediately and then every 20s. A Supabase Realtime broadcast on
 * `display:<id>` (event "refresh") is only a fast-path nudge to poll sooner
 * — it never carries the payload itself.
 *
 * Fetch failures are silent-retry: this is a wall display, so it keeps
 * showing whatever it last rendered rather than surfacing an error.
 */
export function useDisplaySync(): void {
  const displayId = useDisplayStore((s) => s.displayId);
  const deviceToken = useDisplayStore((s) => s.deviceToken);
  const syncActive = useDisplayStore((s) => s.syncActive);
  const setPairedName = useDisplayStore((s) => s.setPairedName);
  const clearIdentity = useDisplayStore((s) => s.clearIdentity);
  const navigate = useNavigate();

  const lastAppliedUpdatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!syncActive || !displayId || !deviceToken) return;

    let cancelled = false;
    let syncInFlight: Promise<void> | null = null;
    let rerunRequested = false;
    // A different paired display may legitimately reuse the same updated_at
    // value. Treat each identity/effect lifetime as a fresh synchronization.
    lastAppliedUpdatedAtRef.current = null;

    const applyConfig = async (
      sceneConfig: DisplaySceneConfig,
    ): Promise<boolean> => {
      const { applySceneToMap } = await import(
        "@/lib/kiosk/applySceneToMap"
      );
      if (cancelled) return false;

      // Every owner save (updatedAt changed) applies wholesale and restarts
      // the rotation — including rotation-only changes. No scenes in the
      // config means the owner cleared the assignment, which falls back to
      // the stock defaults (a previous push overwrote the local list, so
      // "local defaults" must be restored explicitly).
      const scenes = sceneConfig.scenes;
      const hasScenes = Array.isArray(scenes) && scenes.length > 0;
      const kioskActions = useKioskStore.getState();
      kioskActions.replaceScenes(hasScenes ? scenes : DEFAULT_SCENES);
      if (sceneConfig.rotation) {
        const rotation: Partial<typeof kioskActions.rotation> = {};
        if (typeof sceneConfig.rotation.enabled === "boolean") {
          rotation.enabled = sceneConfig.rotation.enabled;
        }
        if (
          typeof sceneConfig.rotation.intervalSec === "number" &&
          Number.isFinite(sceneConfig.rotation.intervalSec)
        ) {
          rotation.intervalSec = sceneConfig.rotation.intervalSec;
        }
        kioskActions.setRotation(rotation);
      }
      if (
        sceneConfig.breakInLevel === "CRITICAL" ||
        sceneConfig.breakInLevel === "WARNING" ||
        sceneConfig.breakInLevel === "off"
      ) {
        kioskActions.setBreakInLevel(sceneConfig.breakInLevel);
      }

      // P1: per-display layout override. scene_config is server-fed jsonb,
      // so only apply values that are actually in the unions.
      const layout = sceneConfig.layout;
      const fit = layout?.fit;
      if (fit === "auto" || fit === "compact" || fit === "full") {
        useMapStore.getState().setDisplayFit(fit);
      }
      const scale = layout?.textScale;
      if (
        scale === "sm" ||
        scale === "md" ||
        scale === "lg" ||
        scale === "xl"
      ) {
        useSettingsStore.getState().updatePreferences({ textScale: scale });
      }

      let kiosk = useKioskStore.getState();
      const wasActive = kiosk.active;
      // start() intentionally chooses the first enabled scene; a disabled
      // first row in a remotely assigned playlist must never stall the wall.
      let scene = kiosk.start();
      // The remote assignment remains stored for the owner to fix, but a
      // physical display must never be left active with no renderable scene.
      // Replace the device-side copy with the known-good stock rotation.
      if (!scene) {
        kiosk.replaceScenes(DEFAULT_SCENES);
        kiosk = useKioskStore.getState();
        scene = kiosk.start();
      }
      if (!scene) return false;
      applySceneToMap(scene);
      if (!wasActive) {
        // First entry from the pairing/holding screen (mirrors KioskPage).
        void document.documentElement.requestFullscreen().catch(() => {});
      }
      navigate(scene.route);
      return true;
    };

    const fetchStateOnce = async () => {
      try {
        const res = await fetch(
          `/api/displays/state?id=${encodeURIComponent(displayId)}`,
          { headers: { Authorization: `Bearer ${deviceToken}` } },
        );
        if (cancelled) return;

        if (res.status === 404) {
          // Unknown display or bad token (e.g. the owner deleted this
          // display) — stop the kiosk rotation, drop identity, and return
          // to the pairing screen so a fresh code appears. Navigating to
          // /display/pair keeps the AuthGate wall-device bypass (route
          // based) even though clearIdentity() turns syncActive off.
          useKioskStore.getState().stop();
          clearIdentity();
          navigate("/display/pair", { replace: true });
          return;
        }
        if (!res.ok) return; // Silent retry — keep showing last state.

        const data = (await res.json()) as DisplayStateResponse;
        if (cancelled) return;

        setPairedName(data.name ?? null);

        if (
          data.paired &&
          data.updatedAt !== lastAppliedUpdatedAtRef.current
        ) {
          const applied = await applyConfig(data.sceneConfig ?? {});
          if (applied && !cancelled) {
            // Commit the server version only after its full configuration and
            // navigation succeed. A transient lazy-chunk/application failure
            // therefore remains eligible for the next poll.
            lastAppliedUpdatedAtRef.current = data.updatedAt;
          }
        }
      } catch {
        // Offline or transient failure — silent retry on the next tick.
      }
    };

    // Poll and realtime nudges can arrive together. Coalesce them into one
    // serialized loop so an older response can never finish after and replace
    // a newer assignment.
    const fetchState = (): Promise<void> => {
      if (syncInFlight) {
        rerunRequested = true;
        return syncInFlight;
      }
      syncInFlight = (async () => {
        do {
          rerunRequested = false;
          await fetchStateOnce();
        } while (rerunRequested && !cancelled);
      })().finally(() => {
        syncInFlight = null;
      });
      return syncInFlight;
    };

    void fetchState();
    const interval = setInterval(() => void fetchState(), POLL_INTERVAL_MS);

    let channel: RealtimeChannel | null = null;
    if (isSupabaseConfigured) {
      try {
        channel = getSupabase()
          .channel(`display:${displayId}`)
          .on("broadcast", { event: "refresh" }, () => {
            void fetchState();
          })
          .subscribe();
      } catch {
        channel = null;
      }
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) {
        void getSupabase().removeChannel(channel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncActive, displayId, deviceToken]);
}
