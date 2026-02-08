import { useEffect, useMemo, useState } from "react";
import { DetailModal } from "@/components/ui";
import type { DaemonDiscoveryDaemonsMessage, DeviceInfo } from "@/lib/radio/protocol";

export interface DevicePickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onSelect: (selection: { url: string; deviceId: string | null }) => void;
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

function wsUrlForAddress(address: string, port: number): string {
  // IPv6 needs brackets for ws:// URLs.
  if (address.includes(":") && !address.startsWith("[")) {
    return `ws://[${address}]:${port}`;
  }
  return `ws://${address}:${port}`;
}

type DaemonDeviceFetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; devices: DeviceInfo[] }
  | { status: "error"; error: string };

export function DevicePicker({
  isOpen,
  onClose,
  currentUrl,
  onSelect,
  daemons,
  canRefresh,
  onRefresh,
}: DevicePickerProps) {
  const [manual, setManual] = useState(currentUrl);
  const [devicesByFullname, setDevicesByFullname] = useState<
    Record<string, DaemonDeviceFetchState>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    setManual(currentUrl);
  }, [isOpen, currentUrl]);

  const sorted = useMemo(() => {
    return [...daemons].sort((a, b) => (a.hostname || "").localeCompare(b.hostname || ""));
  }, [daemons]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const controllers: Array<() => void> = [];

    const startFetch = (fullname: string, url: string) => {
      setDevicesByFullname((s) => ({ ...s, [fullname]: { status: "loading" } }));

      let ws: WebSocket | null = null;
      const timeout = window.setTimeout(() => {
        if (cancelled) return;
        try {
          ws?.close();
        } catch {
          // ignore
        }
        setDevicesByFullname((s) => ({
          ...s,
          [fullname]: { status: "error", error: "Timeout" },
        }));
      }, 2500);

      const cleanup = () => {
        window.clearTimeout(timeout);
        try {
          ws?.close();
        } catch {
          // ignore
        }
        ws = null;
      };
      controllers.push(cleanup);

      try {
        ws = new WebSocket(url);
        ws.onopen = () => {
          if (cancelled || !ws) return;
          ws.send(JSON.stringify({ id: `discover-${Date.now()}`, type: "devices:enumerate" }));
        };
        ws.onmessage = (e) => {
          if (cancelled) return;
          if (typeof e.data !== "string") return;
          try {
            const msg = JSON.parse(e.data) as { type?: string; devices?: DeviceInfo[] };
            if (msg.type === "devices:list" && Array.isArray(msg.devices)) {
              setDevicesByFullname((s) => ({
                ...s,
                [fullname]: { status: "success", devices: msg.devices ?? [] },
              }));
              cleanup();
            }
          } catch {
            // ignore
          }
        };
        ws.onerror = () => {
          if (cancelled) return;
          setDevicesByFullname((s) => ({
            ...s,
            [fullname]: { status: "error", error: "Connection failed" },
          }));
          cleanup();
        };
      } catch {
        setDevicesByFullname((s) => ({
          ...s,
          [fullname]: { status: "error", error: "Failed to create WebSocket" },
        }));
        cleanup();
      }
    };

    // Reset state for this open session.
    setDevicesByFullname({});

    for (const d of sorted) {
      const addr = d.addresses[0];
      if (!addr) continue;
      const url = wsUrlForAddress(addr, d.port);
      startFetch(d.fullname, url);
    }

    return () => {
      cancelled = true;
      for (const c of controllers) c();
    };
  }, [isOpen, sorted]);

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
              onSelect({ url, deviceId: null });
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
              const url = addr ? wsUrlForAddress(addr, d.port) : "";
              const radios = d.txt.radios || "";
              const version = d.txt.version || "";
              const devicesState = devicesByFullname[d.fullname] ?? { status: "idle" };
              return (
                <div key={d.fullname} className="px-3 py-2">
                  <button
                    className="w-full text-left hover:bg-white/5 transition-colors rounded-md px-2 py-1 -mx-2"
                    onClick={() => {
                      if (!url) return;
                      onSelect({ url, deviceId: null });
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

                  <div className="mt-2">
                    {devicesState.status === "loading" || devicesState.status === "idle" ? (
                      <div className="text-xs text-gray-500">Loading radios…</div>
                    ) : null}
                    {devicesState.status === "error" ? (
                      <div className="text-xs text-alert-red">
                        Unable to query devices ({devicesState.error}). You can still connect via URL.
                      </div>
                    ) : null}
                    {devicesState.status === "success" ? (
                      devicesState.devices.length > 0 ? (
                        <div className="mt-1 space-y-1">
                          {devicesState.devices.map((dev) => (
                            <button
                              key={dev.device_id}
                              className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-left"
                              onClick={() => {
                                if (!url) return;
                                onSelect({ url, deviceId: dev.device_id });
                                onClose();
                              }}
                            >
                              <div className="min-w-0">
                                <div className="text-xs text-gray-100 font-medium truncate">
                                  {dev.name}
                                </div>
                                <div className="text-[11px] text-gray-500 font-mono truncate">
                                  {dev.device_id}
                                </div>
                              </div>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                  dev.type === "sdr"
                                    ? "bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan"
                                    : "bg-plasma-orange/10 border-plasma-orange/30 text-plasma-orange"
                                }`}
                              >
                                {dev.type.toUpperCase()}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500">No radios reported by this daemon.</div>
                      )
                    ) : null}
                  </div>
                </div>
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
