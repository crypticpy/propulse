import { useEffect, useMemo, useState } from "react";
import { DetailModal } from "@/components/ui";
import type { DaemonDiscoveryDaemonsMessage } from "@/lib/radio/protocol";

export interface DevicePickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onSelectUrl: (url: string) => void;
  daemons: DaemonDiscoveryDaemonsMessage["daemons"];
  canRefresh: boolean;
  onRefresh: () => void;
}

function normalizeWsUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("ws://") || s.startsWith("wss://")) return s;
  return `ws://${s}`;
}

export function DevicePicker({
  isOpen,
  onClose,
  currentUrl,
  onSelectUrl,
  daemons,
  canRefresh,
  onRefresh,
}: DevicePickerProps) {
  const [manual, setManual] = useState(currentUrl);

  useEffect(() => {
    if (!isOpen) return;
    setManual(currentUrl);
  }, [isOpen, currentUrl]);

  const sorted = useMemo(() => {
    return [...daemons].sort((a, b) => (a.hostname || "").localeCompare(b.hostname || ""));
  }, [daemons]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Radio Daemon"
      subtitle="Select a daemon on your LAN, or enter one manually."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Daemon URL</label>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="ws://127.0.0.1:9867"
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-gray-200 text-sm"
            />
          </div>
          <button
            className="px-3 py-2 rounded-md bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30 text-sm"
            onClick={() => {
              const url = normalizeWsUrl(manual);
              if (!url) return;
              onSelectUrl(url);
              onClose();
            }}
          >
            Connect
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Discovered daemons (mDNS)</div>
          <button
            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-200 text-xs border border-white/10 disabled:opacity-50"
            onClick={onRefresh}
            disabled={!canRefresh}
            title={!canRefresh ? "Connect to a local daemon first" : "Refresh discovery"}
          >
            Refresh
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="text-sm text-gray-400 bg-white/5 border border-white/10 rounded-md p-3">
            No daemons discovered yet. If you have a local daemon running, click{" "}
            <span className="text-gray-200">Refresh</span>. Otherwise, enter a
            URL manually (VPN/LAN).
          </div>
        ) : (
          <div className="divide-y divide-white/10 rounded-md border border-white/10 overflow-hidden">
            {sorted.map((d) => {
              const addr = d.addresses[0];
              const url = addr ? `ws://${addr}:${d.port}` : "";
              const radios = d.txt.radios || "";
              const version = d.txt.version || "";
              return (
                <button
                  key={d.fullname}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                  onClick={() => {
                    if (!url) return;
                    onSelectUrl(url);
                    onClose();
                  }}
                  disabled={!url}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-gray-100 font-medium truncate">
                      {d.hostname || d.fullname}
                    </div>
                    <div className="text-xs text-gray-400">{version}</div>
                  </div>
                  <div className="text-xs text-gray-400 truncate">{url || "No address"}</div>
                  {radios ? (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      Radios: {radios}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        <div className="text-[11px] text-gray-500">
          Tip: remote access is best via VPN (Tailscale/WireGuard). For LAN
          discovery to work, the daemon must bind to <code>0.0.0.0</code> and mDNS
          must be enabled.
        </div>
      </div>
    </DetailModal>
  );
}

export default DevicePicker;

