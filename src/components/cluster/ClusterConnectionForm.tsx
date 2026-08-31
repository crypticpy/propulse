/**
 * ClusterConnectionForm
 *
 * The DX cluster connection controls: node picker, login callsign, optional
 * password, cluster-side band/mode filters and a connect/disconnect action,
 * over a live status row driven by the bridge's `cluster.status` broadcast.
 *
 * Rendered by both the Settings page (`compact={false}`) and the map toolbar
 * popover (`compact`), so there is one place to change cluster behaviour.
 *
 * Connection control runs through `useDXCluster`, which already holds a bridge
 * socket — this component never opens one of its own.
 */

import { useState, useEffect, useCallback, memo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useDXStore } from "@/stores/dxStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import {
  loadPrefs,
  savePrefs,
  resolveNode,
  canConnect,
  toggleFilter,
  WELL_KNOWN_NODES,
  FILTER_BANDS,
  FILTER_MODES,
  DEFAULT_CLUSTER_PORT,
  type ClusterPrefs,
} from "@/lib/cluster/clusterPrefs";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Connect button state, derived from the bridge-reported link status. */
type LinkPhase = "disconnected" | "connecting" | "connected";

/** How long to wait for the bridge to report before giving up on the attempt */
const CONNECT_TIMEOUT_MS = 20_000;

interface ClusterConnectionFormProps {
  /** Tighter spacing and collapsed filters, for the map toolbar popover */
  compact?: boolean;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ClusterConnectionForm = memo(function ClusterConnectionForm({
  compact = false,
  className = "",
}: ClusterConnectionFormProps) {
  const station = useUserStore((s) => s.station);
  const spotSource = useDXStore((s) => s.spotSource);
  const clusterStatus = useDXStore((s) => s.clusterStatus);
  const spotCount = useDXStore((s) => s.spots.length);
  const { bridgeConnected, clusterConnect, clusterDisconnect } = useDXCluster();

  const [prefs, setPrefs] = useState<ClusterPrefs>(() => {
    const loaded = loadPrefs();
    if (!loaded.callsign && station?.callsign) {
      loaded.callsign = station.callsign;
    }
    return loaded;
  });

  // Set while a connect request is in flight, cleared once the bridge reports.
  const [awaitingLink, setAwaitingLink] = useState(false);
  const [showFilters, setShowFilters] = useState(!compact);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Adopt the station callsign once it becomes known, if nothing was typed.
  useEffect(() => {
    if (!prefs.callsign && station?.callsign) {
      setPrefs((p) => ({ ...p, callsign: station.callsign }));
    }
  }, [station?.callsign, prefs.callsign]);

  // The bridge has spoken — stop showing "Connecting...".
  useEffect(() => {
    if (clusterStatus || !bridgeConnected) setAwaitingLink(false);
  }, [clusterStatus, bridgeConnected]);

  // The bridge only reports on connect/close, so a node that never answers
  // would otherwise leave the button reading "Connecting..." indefinitely.
  useEffect(() => {
    if (!awaitingLink) return;
    const id = setTimeout(() => setAwaitingLink(false), CONNECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [awaitingLink]);

  const phase: LinkPhase = clusterStatus?.connected
    ? "connected"
    : awaitingLink
      ? "connecting"
      : "disconnected";

  const node = resolveNode(prefs);
  const connectable = canConnect(prefs) && bridgeConnected;

  const updatePref = useCallback(
    <K extends keyof ClusterPrefs>(key: K, value: ClusterPrefs[K]) => {
      setPrefs((p) => ({ ...p, [key]: value }));
    },
    [],
  );

  const handleConnect = useCallback(() => {
    if (!connectable) return;
    setAwaitingLink(true);
    if (!clusterConnect(prefs)) setAwaitingLink(false);
  }, [connectable, clusterConnect, prefs]);

  const handleDisconnect = useCallback(() => {
    clusterDisconnect();
    setAwaitingLink(false);
  }, [clusterDisconnect]);

  const locked = phase === "connected";
  const fieldClass = `w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
    text-white text-sm placeholder-gray-500 focus:outline-none
    focus:border-plasma-orange/50 disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className={`${compact ? "space-y-2.5" : "space-y-4"} ${className}`}>
      {/* ── Status ── */}
      <div className="flex items-center justify-between gap-2 p-2.5 bg-nebula-blue rounded-lg border border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              phase === "connected"
                ? "bg-signal-green"
                : phase === "connecting"
                  ? "bg-caution-amber animate-pulse"
                  : "bg-gray-500"
            }`}
          />
          <span className="text-sm text-gray-200 truncate">
            {phase === "connected"
              ? (clusterStatus?.node ?? node.label)
              : phase === "connecting"
                ? "Connecting…"
                : bridgeConnected
                  ? "Not connected"
                  : "Bridge offline"}
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-gray-500 flex-shrink-0">
          <span>
            via{" "}
            <span className="text-gray-300">
              {spotSource === "bridge" ? "cluster" : "REST"}
            </span>
          </span>
          {/* Live store count, not `clusterStatus.spotsReceived` — the bridge
              only emits status on connect/disconnect, so its counter is frozen
              at whatever it was when the link came up. */}
          <span className="font-mono text-gray-300" title="Spots held">
            {spotCount}
          </span>
        </div>
      </div>

      {/* ── Node ── */}
      <div className="space-y-1.5">
        <label
          htmlFor="cluster-node"
          className="block text-xs font-medium text-gray-400"
        >
          Cluster node
        </label>
        <select
          id="cluster-node"
          value={prefs.selectedNodeIndex}
          onChange={(e) =>
            updatePref("selectedNodeIndex", Number(e.target.value))
          }
          disabled={locked}
          className={`${fieldClass} appearance-none cursor-pointer pr-8`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            backgroundSize: "1rem",
          }}
        >
          {WELL_KNOWN_NODES.map((known, i) => (
            <option key={`${known.host}:${known.port}`} value={i}>
              {compact
                ? `${known.label} — ${known.region}`
                : `${known.label} (${known.region}) - ${known.host}:${known.port}`}
            </option>
          ))}
          <option value={-1}>Custom node…</option>
        </select>
      </div>

      {prefs.selectedNodeIndex === -1 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label
              htmlFor="cluster-host"
              className="block text-xs text-gray-400 mb-1"
            >
              Host
            </label>
            <input
              type="text"
              id="cluster-host"
              value={prefs.customHost}
              onChange={(e) => updatePref("customHost", e.target.value)}
              placeholder="cluster.example.com"
              disabled={locked}
              className={`${fieldClass} font-mono`}
            />
          </div>
          <div>
            <label
              htmlFor="cluster-port"
              className="block text-xs text-gray-400 mb-1"
            >
              Port
            </label>
            <input
              type="number"
              id="cluster-port"
              value={prefs.customPort}
              onChange={(e) =>
                updatePref(
                  "customPort",
                  Number(e.target.value) || DEFAULT_CLUSTER_PORT,
                )
              }
              disabled={locked}
              className={`${fieldClass} font-mono`}
            />
          </div>
        </div>
      )}

      {/* ── Login ── */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="cluster-callsign"
            className="block text-xs text-gray-400 mb-1"
          >
            Login callsign
          </label>
          <input
            type="text"
            id="cluster-callsign"
            value={prefs.callsign}
            onChange={(e) =>
              updatePref("callsign", e.target.value.toUpperCase())
            }
            placeholder="N5XXX"
            disabled={locked}
            className={`${fieldClass} font-mono`}
          />
        </div>
        <div>
          <label
            htmlFor="cluster-password"
            className="block text-xs text-gray-400 mb-1"
          >
            Password <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="password"
            id="cluster-password"
            value={prefs.password}
            onChange={(e) => updatePref("password", e.target.value)}
            placeholder="not saved"
            disabled={locked}
            className={`${fieldClass} font-mono`}
          />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {compact ? (
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-200 transition-colors"
            aria-expanded={showFilters}
          >
            <span
              className={`transition-transform ${showFilters ? "rotate-90" : ""}`}
              aria-hidden="true"
            >
              ›
            </span>
            Spot filters
            {prefs.filterBands.length + prefs.filterModes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-plasma-orange/20 text-plasma-orange text-[10px] leading-none normal-case tracking-normal">
                {prefs.filterBands.length + prefs.filterModes.length}
              </span>
            )}
          </button>
        ) : (
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Spot filters
          </h4>
        )}

        {showFilters && (
          <div className="space-y-2.5">
            <FilterChips
              label="Bands"
              options={FILTER_BANDS}
              selected={prefs.filterBands}
              onToggle={(band) =>
                updatePref("filterBands", toggleFilter(prefs.filterBands, band))
              }
            />
            <FilterChips
              label="Modes"
              options={FILTER_MODES}
              selected={prefs.filterModes}
              onToggle={(mode) =>
                updatePref("filterModes", toggleFilter(prefs.filterModes, mode))
              }
            />
          </div>
        )}
      </div>

      {/* ── Action ── */}
      {phase === "connected" ? (
        <button
          type="button"
          onClick={handleDisconnect}
          className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors
                     bg-alert-red/20 border border-alert-red/50 text-alert-red hover:bg-alert-red/30"
        >
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={!connectable || phase === "connecting"}
          className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !connectable || phase === "connecting"
              ? "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
              : "bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30"
          }`}
        >
          {phase === "connecting"
            ? "Connecting…"
            : !bridgeConnected
              ? "Bridge not running"
              : !canConnect(prefs)
                ? "Enter a callsign"
                : "Connect"}
        </button>
      )}
    </div>
  );
});

// ─── Filter chip row ─────────────────────────────────────────────────────────

interface FilterChipsProps {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}

function FilterChips({ label, options, selected, onToggle }: FilterChipsProps) {
  return (
    <div>
      <span className="block text-xs text-gray-500 mb-1.5">
        {label} <span className="text-gray-600">(empty = all)</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            aria-pressed={selected.includes(option)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              selected.includes(option)
                ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ClusterConnectionForm;
