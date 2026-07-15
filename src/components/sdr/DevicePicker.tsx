import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DetailModal } from "@/components/ui";
import {
  isDaemonResponseMessage,
  isDevicesListMessage,
  type DaemonDiscoveryDaemonsMessage,
  type DeviceInfo,
} from "@/lib/radio/protocol";
import { useRadioDaemon } from "@/hooks/useRadioDaemon";

export interface DevicePickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onSelect: (selection: { url: string; deviceId: string | null }) => void;
  daemons: DaemonDiscoveryDaemonsMessage["daemons"];
  canRefresh: boolean;
  onRefresh: () => void;
  authToken: string;
  onAuthTokenChange: (token: string) => void;
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

function DaemonAddressProbe({
  url,
  enabled,
  authToken,
  onDevices,
  onError,
}: {
  url: string;
  enabled: boolean;
  authToken: string;
  onDevices: (devices: DeviceInfo[]) => void;
  onError: (error: string) => void;
}) {
  const failureReportedRef = useRef(false);
  const enumerationTimeoutRef = useRef<number | null>(null);
  const clearEnumerationTimeout = useCallback(() => {
    if (enumerationTimeoutRef.current !== null) {
      window.clearTimeout(enumerationTimeoutRef.current);
      enumerationTimeoutRef.current = null;
    }
  }, []);
  const probe = useRadioDaemon({
    enabled,
    url,
    authToken: authToken || undefined,
    autoReconnect: false,
    trackLastMessage: false,
    trackLastFrame: false,
    onMessage: (message) => {
      if (isDevicesListMessage(message)) {
        clearEnumerationTimeout();
        onDevices(message.devices);
      }
      if (
        isDaemonResponseMessage(message) &&
        !message.success &&
        !failureReportedRef.current
      ) {
        clearEnumerationTimeout();
        failureReportedRef.current = true;
        onError(message.error ?? "Daemon rejected device enumeration");
      }
    },
  });

  useEffect(() => {
    if (!enabled || !probe.error || failureReportedRef.current) return;
    clearEnumerationTimeout();
    failureReportedRef.current = true;
    onError(probe.error);
  }, [clearEnumerationTimeout, enabled, onError, probe.error]);

  useEffect(() => {
    failureReportedRef.current = false;
    clearEnumerationTimeout();
    if (!enabled || !url) return;

    enumerationTimeoutRef.current = window.setTimeout(() => {
      enumerationTimeoutRef.current = null;
      if (failureReportedRef.current) return;
      failureReportedRef.current = true;
      onError("Timed out while enumerating devices at this daemon address");
    }, 12_000);

    return clearEnumerationTimeout;
  }, [authToken, clearEnumerationTimeout, enabled, onError, url]);

  return null;
}

function DiscoveredDaemonRow({
  daemon,
  isOpen,
  authToken,
  onSelect,
  onClose,
}: {
  daemon: DaemonDiscoveryDaemonsMessage["daemons"][number];
  isOpen: boolean;
  authToken: string;
  onSelect: (selection: { url: string; deviceId: string | null }) => void;
  onClose: () => void;
}) {
  const urls = useMemo(
    () => daemon.addresses.map((address) => wsUrlForAddress(address, daemon.port)),
    [daemon.addresses, daemon.port],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [fetchState, setFetchState] = useState<DaemonDeviceFetchState>({
    status: "idle",
  });
  const url = urls[candidateIndex] ?? "";

  useEffect(() => {
    if (!isOpen) return;
    setCandidateIndex(0);
    setFetchState(
      urls.length > 0
        ? { status: "loading" }
        : { status: "error", error: "No usable daemon address was advertised" },
    );
  }, [isOpen, urls]);

  const radios = daemon.txt.radios || "";
  const version = daemon.txt.version || "";

  return (
    <div className="px-3 py-2">
      {url ? (
        <DaemonAddressProbe
          key={`${isOpen}-${url}`}
          url={url}
          enabled={isOpen && fetchState.status !== "success"}
          authToken={authToken}
          onDevices={(devices) =>
            setFetchState({ status: "success", devices })
          }
          onError={(error) => {
            if (candidateIndex + 1 < urls.length) {
              setCandidateIndex((index) => index + 1);
              setFetchState({ status: "loading" });
            } else {
              setFetchState({ status: "error", error });
            }
          }}
        />
      ) : null}
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
            {daemon.hostname || daemon.fullname}
          </div>
          <div className="text-xs text-gray-400">{version}</div>
        </div>
        <div className="text-xs text-gray-400 truncate">{url || "No address"}</div>
        {radios ? (
          <div className="text-xs text-gray-500 truncate mt-0.5">Radios: {radios}</div>
        ) : null}
      </button>

      <div className="mt-2">
        {fetchState.status === "loading" || fetchState.status === "idle" ? (
          <div className="text-xs text-gray-500">Loading radios…</div>
        ) : null}
        {fetchState.status === "error" ? (
          <div className="text-xs text-alert-red">
            Unable to query devices ({fetchState.error}). You can still connect via URL.
          </div>
        ) : null}
        {fetchState.status === "success" ? (
          fetchState.devices.length > 0 ? (
            <div className="mt-1 space-y-1">
              {fetchState.devices.map((device) => (
                <button
                  key={device.device_id}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-left"
                  onClick={() => {
                    if (!url) return;
                    onSelect({ url, deviceId: device.device_id });
                    onClose();
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-xs text-gray-100 font-medium truncate">{device.name}</div>
                    <div className="text-[11px] text-gray-500 font-mono truncate">
                      {device.device_id}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      device.type === "sdr"
                        ? "bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan"
                        : "bg-plasma-orange/10 border-plasma-orange/30 text-plasma-orange"
                    }`}
                  >
                    {device.type.toUpperCase()}
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
}

export function DevicePicker({
  isOpen,
  onClose,
  currentUrl,
  onSelect,
  daemons,
  canRefresh,
  onRefresh,
  authToken,
  onAuthTokenChange,
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
              onSelect({ url, deviceId: null });
              onClose();
            }}
          >
            Connect
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Daemon auth token
          </label>
          <input
            type="password"
            autoComplete="off"
            value={authToken}
            onChange={(event) => onAuthTokenChange(event.target.value)}
            placeholder="Required for authenticated LAN daemons"
            className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-gray-200 text-sm"
          />
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
            {sorted.map((daemon) => (
              <DiscoveredDaemonRow
                key={daemon.fullname}
                daemon={daemon}
                isOpen={isOpen}
                authToken={authToken}
                onSelect={onSelect}
                onClose={onClose}
              />
            ))}
          </div>
        )}

        <div className="text-[11px] text-gray-500">
          Tip: remote access is best via VPN (Tailscale/WireGuard). For LAN
          discovery to work, the daemon must bind to <code>0.0.0.0</code>, mDNS
          must be enabled, and an auth token should be configured. Do not expose
          an unauthenticated daemon on a LAN.
        </div>
      </div>
    </DetailModal>
  );
}

export default DevicePicker;
