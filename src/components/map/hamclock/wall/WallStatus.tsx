import { useEffect, useState } from "react";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useDXStore } from "@/stores/dxStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";

type Tone = "good" | "warn" | "idle";

interface Indicator {
  id: string;
  tone: Tone;
  text: string;
}

/** A cluster feed whose newest spot is older than this has gone quiet: the
 * spot store keeps its last non-empty result through a failed fetch, so the
 * dot follows spot age, not retained volume (Copilot review on PR #282).
 * Matches the server-side 30-minute age floor in `api/_lib/spotStore.ts`. */
const CLUSTER_STALE_MS = 30 * 60_000;
const CLOCK_MS = 60_000;

function spotMillis(time: Date | string): number {
  const ms = time instanceof Date ? time.getTime() : Date.parse(time);
  return Number.isFinite(ms) ? ms : 0;
}

const DOT_CLASS: Record<Tone, string> = {
  good: "",
  warn: "hc-status-warn",
  idle: "hc-status-idle",
};

/**
 * Footer health strip (right end of the wall footer, wall spec §21). Every
 * indicator reads a store another hook already fills, so the footer never
 * opens a second socket or feed:
 *
 * - NET follows the browser's online/offline events.
 * - BRIDGE mirrors the bridge WebSocket transport that `useRigBridgeSync`
 *   owns; OFF when the bridge is disabled in settings, SEEKING while the
 *   transport reconnects.
 * - RIG is the CAT session on that bridge; OFF when no backend is chosen.
 * - CLUSTER is the spot store the cluster hook fills, with its source; the
 *   dot warns once the newest spot is older than `CLUSTER_STALE_MS`.
 * - MODEL follows the band-verdict engine behind the Best band hero.
 */
export function WallStatus() {
  const { isOnline } = useOfflineStatus();
  const bridgeEnabled = useSettingsStore((s) => s.bridgeEnabled);
  const bridgeConnected = useRigStore((s) => s.bridgeConnected);
  const catEnabled = useRigStore((s) => s.catEnabled);
  const rigConnected = useRigStore((s) => s.connected);
  const spots = useDXStore((s) => s.spots);
  const source = useDXStore((s) => s.spotSource);
  const modelReady = useBandVerdicts().ready;

  // Nothing re-renders the strip when a feed simply stops, so one slow
  // local clock ages the cluster dot out.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  const count = spots.length;
  const newestAt = spots.reduce(
    (max, spot) => Math.max(max, spotMillis(spot.time)),
    0,
  );
  const clusterTone: Tone =
    count === 0 ? "idle" : now - newestAt <= CLUSTER_STALE_MS ? "good" : "warn";

  const indicators: Indicator[] = [
    isOnline
      ? { id: "net", tone: "good", text: "NET ONLINE" }
      : { id: "net", tone: "warn", text: "NET OFFLINE" },
    !bridgeEnabled
      ? { id: "bridge", tone: "idle", text: "BRIDGE OFF" }
      : bridgeConnected
        ? { id: "bridge", tone: "good", text: "BRIDGE LINKED" }
        : { id: "bridge", tone: "warn", text: "BRIDGE SEEKING" },
    !catEnabled
      ? { id: "rig", tone: "idle", text: "RIG OFF" }
      : rigConnected
        ? { id: "rig", tone: "good", text: "RIG ATTACHED" }
        : { id: "rig", tone: "warn", text: "RIG WAITING" },
    {
      id: "cluster",
      tone: clusterTone,
      text: `CLUSTER ${count} · ${source === "bridge" ? "BRIDGE" : "REST"}`,
    },
    modelReady
      ? { id: "model", tone: "good", text: "MODEL LIVE" }
      : { id: "model", tone: "idle", text: "MODEL WAITING" },
  ];

  return (
    <div className="hc-status" role="status" aria-label="Wall health">
      {indicators.map((indicator) => (
        <span key={indicator.id} data-tone={indicator.tone}>
          <i className={DOT_CLASS[indicator.tone]} />
          {indicator.text}
        </span>
      ))}
    </div>
  );
}
