import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useDisplayStore,
  type DisplaySceneConfig,
} from "@/stores/displayStore";
import { useKioskStore, applySceneToMap } from "@/stores/kioskStore";
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

    const applyConfig = (sceneConfig: DisplaySceneConfig) => {
      const scenes = sceneConfig.scenes;
      const hasScenes = Array.isArray(scenes) && scenes.length > 0;

      if (hasScenes) {
        const current = useKioskStore.getState();
        useKioskStore.setState({
          scenes,
          rotation: sceneConfig.rotation ?? current.rotation,
          breakInLevel: sceneConfig.breakInLevel ?? current.breakInLevel,
        });
      }

      const kiosk = useKioskStore.getState();
      if (!kiosk.active) {
        // Device was showing the pairing/holding screen — enter kiosk mode
        // for the first time (mirrors KioskPage's launch sequence).
        const scene = kiosk.start();
        if (!scene) return;
        applySceneToMap(scene);
        void document.documentElement.requestFullscreen().catch(() => {});
        navigate(scene.route);
      } else if (hasScenes) {
        // Already rotating — only restart if the owner pushed new scenes.
        const scene = kiosk.start(scenes![0].id);
        if (!scene) return;
        applySceneToMap(scene);
        navigate(scene.route);
      }
    };

    const fetchState = async () => {
      try {
        const res = await fetch(
          `/api/displays/state?id=${encodeURIComponent(displayId)}`,
          { headers: { Authorization: `Bearer ${deviceToken}` } },
        );
        if (cancelled) return;

        if (res.status === 404) {
          // Unknown display or bad token — identity is lost, re-pair.
          clearIdentity();
          return;
        }
        if (!res.ok) return; // Silent retry — keep showing last state.

        const data = (await res.json()) as DisplayStateResponse;
        if (cancelled) return;

        setPairedName(data.name ?? null);

        if (
          data.paired &&
          data.sceneConfig &&
          data.updatedAt !== lastAppliedUpdatedAtRef.current
        ) {
          lastAppliedUpdatedAtRef.current = data.updatedAt;
          applyConfig(data.sceneConfig);
        }
      } catch {
        // Offline or transient failure — silent retry on the next tick.
      }
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
