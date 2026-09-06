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
 * - CLUSTER is the spot store the cluster hook fills, with its source.
 * - MODEL follows the band-verdict engine behind the Best band hero.
 */
export function WallStatus() {
  const { isOnline } = useOfflineStatus();
  const bridgeEnabled = useSettingsStore((s) => s.bridgeEnabled);
  const bridgeConnected = useRigStore((s) => s.bridgeConnected);
  const catEnabled = useRigStore((s) => s.catEnabled);
  const rigConnected = useRigStore((s) => s.connected);
  const count = useDXStore((s) => s.spots.length);
  const source = useDXStore((s) => s.spotSource);
  const modelReady = useBandVerdicts().ready;

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
      tone: count > 0 ? "good" : "idle",
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
