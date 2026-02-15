/**
 * ClusterSettings Component
 *
 * DX Cluster bridge configuration panel.
 * - Cluster node selection (dropdown of common nodes + custom entry)
 * - Login callsign input (pre-filled from user store)
 * - Optional password field
 * - Connection status indicator (connected/disconnected/connecting)
 * - Spot filter configuration (bands, modes)
 * - Connect/Disconnect button
 * - Source indicator showing current spot source (bridge/rest/demo)
 */

import { useState, useEffect, useCallback, memo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useDXStore, type DXSpotSource } from "@/stores/dxStore";

// ─── Well-known cluster nodes ────────────────────────────────────────────────

interface ClusterNode {
  host: string;
  port: number;
  label: string;
  region: string;
}

const WELL_KNOWN_NODES: ClusterNode[] = [
  {
    host: "dxc.ve7cc.net",
    port: 7300,
    label: "VE7CC",
    region: "North America",
  },
  {
    host: "dxc.nc7j.com",
    port: 7373,
    label: "NC7J",
    region: "North America",
  },
  {
    host: "spider.ham-radio.ch",
    port: 7300,
    label: "HB9DRV",
    region: "Europe",
  },
  {
    host: "dx.k3lr.com",
    port: 7300,
    label: "K3LR",
    region: "North America",
  },
  {
    host: "dxc.k3lr.com",
    port: 7300,
    label: "K3LR Alt",
    region: "North America",
  },
];

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS_KEY = "propulse-cluster-settings";

interface ClusterPrefs {
  selectedNodeIndex: number; // -1 = custom
  customHost: string;
  customPort: number;
  callsign: string;
  password: string;
  filterBands: string[];
  filterModes: string[];
}

const DEFAULT_PREFS: ClusterPrefs = {
  selectedNodeIndex: 0,
  customHost: "",
  customPort: 7300,
  callsign: "",
  password: "",
  filterBands: [],
  filterModes: [],
};

function loadPrefs(): ClusterPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFS;
}

function savePrefs(prefs: ClusterPrefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

// ─── Constants for filter chips ──────────────────────────────────────────────

const FILTER_BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
] as const;

const FILTER_MODES = ["CW", "SSB", "FT8", "FT4", "RTTY", "DATA"] as const;

// ─── Connection status type ──────────────────────────────────────────────────

type ClusterConnectionStatus = "disconnected" | "connecting" | "connected";

// ─── Source label helper ─────────────────────────────────────────────────────

function sourceLabel(source: DXSpotSource): string {
  switch (source) {
    case "bridge":
      return "Bridge (WebSocket)";
    case "rest":
      return "REST API";
    default:
      return source;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ClusterSettingsProps {
  className?: string;
  /** Optional bridge send function for cluster.connect / cluster.disconnect */
  bridgeSend?: <T>(type: string, payload: T) => boolean;
  /** Optional bridge connection status */
  bridgeConnected?: boolean;
}

export const ClusterSettings = memo(function ClusterSettings({
  className = "",
  bridgeSend,
  bridgeConnected = false,
}: ClusterSettingsProps) {
  const station = useUserStore((s) => s.station);
  const spotSource = useDXStore((s) => s.spotSource);
  const spots = useDXStore((s) => s.spots);

  // Local form state
  const [prefs, setPrefs] = useState<ClusterPrefs>(() => {
    const loaded = loadPrefs();
    // Pre-fill callsign from user store if not set
    if (!loaded.callsign && station?.callsign) {
      loaded.callsign = station.callsign;
    }
    return loaded;
  });

  const [connectionStatus, setConnectionStatus] =
    useState<ClusterConnectionStatus>("disconnected");
  const [spotsReceived, setSpotsReceived] = useState(0);

  // Persist prefs on change
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Sync callsign from user store when it changes (if local callsign is empty)
  useEffect(() => {
    if (!prefs.callsign && station?.callsign) {
      setPrefs((p) => ({ ...p, callsign: station.callsign }));
    }
  }, [station?.callsign, prefs.callsign]);

  // Track spots count
  useEffect(() => {
    setSpotsReceived(spots.length);
  }, [spots.length]);

  // Determine the current node
  const currentNode =
    prefs.selectedNodeIndex >= 0
      ? WELL_KNOWN_NODES[prefs.selectedNodeIndex]
      : null;

  const effectiveHost = currentNode?.host ?? prefs.customHost;
  const effectivePort = currentNode?.port ?? prefs.customPort;

  // Update a single pref field
  const updatePref = useCallback(
    <K extends keyof ClusterPrefs>(key: K, value: ClusterPrefs[K]) => {
      setPrefs((p) => ({ ...p, [key]: value }));
    },
    [],
  );

  // Toggle band/mode filters
  const toggleBand = useCallback((band: string) => {
    setPrefs((p) => ({
      ...p,
      filterBands: p.filterBands.includes(band)
        ? p.filterBands.filter((b) => b !== band)
        : [...p.filterBands, band],
    }));
  }, []);

  const toggleMode = useCallback((mode: string) => {
    setPrefs((p) => ({
      ...p,
      filterModes: p.filterModes.includes(mode)
        ? p.filterModes.filter((m) => m !== mode)
        : [...p.filterModes, mode],
    }));
  }, []);

  // Connect / Disconnect
  const handleConnect = useCallback(() => {
    if (!bridgeSend) return;
    if (!prefs.callsign.trim()) return;

    const selectedBands = prefs.filterBands
      .map((b) => parseInt(b, 10))
      .filter((b) => Number.isFinite(b));

    setConnectionStatus("connecting");
    const success = bridgeSend("cluster.connect", {
      nodes: [
        {
          host: effectiveHost,
          port: effectivePort,
          name: currentNode?.label ?? effectiveHost,
        },
      ],
      callsign: prefs.callsign.trim().toUpperCase(),
      password: prefs.password || undefined,
      filters: {
        bands: selectedBands.length > 0 ? selectedBands : undefined,
        modes: prefs.filterModes.length > 0 ? prefs.filterModes : undefined,
      },
    });

    if (!success) {
      setConnectionStatus("disconnected");
    }
  }, [
    bridgeSend,
    prefs.callsign,
    prefs.password,
    prefs.filterBands,
    prefs.filterModes,
    effectiveHost,
    effectivePort,
    currentNode?.label,
  ]);

  const handleDisconnect = useCallback(() => {
    if (!bridgeSend) return;
    bridgeSend("cluster.disconnect", {});
    setConnectionStatus("disconnected");
  }, [bridgeSend]);

  // Infer connection status from bridge
  useEffect(() => {
    if (!bridgeConnected) {
      setConnectionStatus("disconnected");
    }
  }, [bridgeConnected]);

  // ─── Status dot ────────────────────────────────────────────────────────

  const statusDotColor =
    connectionStatus === "connected"
      ? "bg-signal-green"
      : connectionStatus === "connecting"
        ? "bg-solar-yellow animate-pulse"
        : "bg-gray-500";

  const statusText =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "connecting"
        ? "Connecting..."
        : "Disconnected";

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        DX Cluster Connection
      </h3>

      {/* Connection Status */}
      <div className="flex items-center justify-between p-3 bg-nebula-blue rounded-lg border border-white/10">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusDotColor}`} />
          <span className="text-sm text-gray-200">{statusText}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            Source:{" "}
            <span className="text-gray-300">{sourceLabel(spotSource)}</span>
          </span>
          <span>
            Spots:{" "}
            <span className="text-gray-300 font-mono">{spotsReceived}</span>
          </span>
        </div>
      </div>

      {/* Cluster Node Selection */}
      <div className="space-y-2">
        <label
          htmlFor="cluster-node"
          className="block text-sm font-medium text-gray-300"
        >
          Cluster Node
        </label>
        <select
          id="cluster-node"
          value={prefs.selectedNodeIndex}
          onChange={(e) => {
            updatePref("selectedNodeIndex", Number(e.target.value));
          }}
          disabled={connectionStatus === "connected"}
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                     text-white text-sm focus:outline-none focus:border-plasma-orange/50
                     appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            backgroundSize: "1rem",
          }}
        >
          {WELL_KNOWN_NODES.map((node, i) => (
            <option key={`${node.host}:${node.port}`} value={i}>
              {node.label} ({node.region}) - {node.host}:{node.port}
            </option>
          ))}
          <option value={-1}>Custom node...</option>
        </select>
      </div>

      {/* Custom Node Inputs */}
      {prefs.selectedNodeIndex === -1 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label
              htmlFor="custom-host"
              className="block text-xs text-gray-400 mb-1"
            >
              Host
            </label>
            <input
              type="text"
              id="custom-host"
              value={prefs.customHost}
              onChange={(e) => updatePref("customHost", e.target.value)}
              placeholder="cluster.example.com"
              disabled={connectionStatus === "connected"}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label
              htmlFor="custom-port"
              className="block text-xs text-gray-400 mb-1"
            >
              Port
            </label>
            <input
              type="number"
              id="custom-port"
              value={prefs.customPort}
              onChange={(e) =>
                updatePref("customPort", Number(e.target.value) || 7300)
              }
              disabled={connectionStatus === "connected"}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      )}

      {/* Callsign & Password */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="cluster-callsign"
            className="block text-xs text-gray-400 mb-1"
          >
            Login Callsign
          </label>
          <input
            type="text"
            id="cluster-callsign"
            value={prefs.callsign}
            onChange={(e) =>
              updatePref("callsign", e.target.value.toUpperCase())
            }
            placeholder="N5XXX"
            disabled={connectionStatus === "connected"}
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white text-sm font-mono placeholder-gray-500
                       focus:outline-none focus:border-plasma-orange/50
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label
            htmlFor="cluster-password"
            className="block text-xs text-gray-400 mb-1"
          >
            Password{" "}
            <span className="text-gray-600 font-normal">(optional)</span>
          </label>
          <input
            type="password"
            id="cluster-password"
            value={prefs.password}
            onChange={(e) => updatePref("password", e.target.value)}
            placeholder="optional"
            disabled={connectionStatus === "connected"}
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                       text-white text-sm font-mono placeholder-gray-500
                       focus:outline-none focus:border-plasma-orange/50
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Spot Filters */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Spot Filters
        </h4>

        {/* Band Filters */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            Bands <span className="text-gray-600">(empty = all bands)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => toggleBand(band)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all
                  ${
                    prefs.filterBands.includes(band)
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                  }`}
              >
                {band}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Filters */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            Modes <span className="text-gray-600">(empty = all modes)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => toggleMode(mode)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all
                  ${
                    prefs.filterModes.includes(mode)
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
                  }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Connect / Disconnect Button */}
      {connectionStatus === "connected" ? (
        <button
          type="button"
          onClick={handleDisconnect}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                     bg-alert-red/20 border border-alert-red/50 text-alert-red
                     hover:bg-alert-red/30"
        >
          Disconnect from Cluster
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={
            !prefs.callsign.trim() ||
            connectionStatus === "connecting" ||
            !bridgeSend
          }
          className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
            ${
              !prefs.callsign.trim() ||
              connectionStatus === "connecting" ||
              !bridgeSend
                ? "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
                : "bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30"
            }`}
        >
          {connectionStatus === "connecting"
            ? "Connecting..."
            : !bridgeSend
              ? "Bridge not available"
              : "Connect to Cluster"}
        </button>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
        <svg
          className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-xs text-gray-500">
          The DX cluster connection requires the ProPulse Bridge to be running
          locally. When connected, spots stream in real-time via WebSocket.
          Without the bridge, spots are fetched from the REST API.
        </p>
      </div>
    </div>
  );
});

export default ClusterSettings;
