/**
 * ClusterPopover — DX cluster connection from the map toolbar
 *
 * Surfaces the cluster node, login and spot filters where the spots are
 * actually watched, instead of only under Settings → Connections. Renders the
 * shared `ClusterConnectionForm` in compact mode.
 *
 * Follows the same popover pattern as ColorsPopover / LayersPopover /
 * WatchPopover: relative container, absolute panel, click-outside + Escape.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useDXStore } from "@/stores/dxStore";
import { ClusterConnectionFormConnected } from "@/components/cluster/ClusterConnectionForm";

export function ClusterPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const clusterStatus = useDXStore((s) => s.clusterStatus);
  const spotSource = useDXStore((s) => s.spotSource);

  const connected = clusterStatus?.connected ?? false;

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Close on Escape ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
          open
            ? "bg-white/15 text-white"
            : "text-gray-300 hover:text-white hover:bg-white/10"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
        title={
          connected
            ? `Cluster connected: ${clusterStatus?.node ?? "node"}`
            : "DX cluster connection"
        }
      >
        {/* Tower / broadcast icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3.2 2.6a5.5 5.5 0 0 0 0 8.8M10.8 2.6a5.5 5.5 0 0 1 0 8.8" />
          <path d="M5.2 4.8a2.8 2.8 0 0 0 0 4.4M8.8 4.8a2.8 2.8 0 0 1 0 4.4" />
          <circle cx="7" cy="7" r="1.1" fill="currentColor" stroke="none" />
        </svg>
        <span>Cluster</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            connected
              ? "bg-signal-green"
              : spotSource === "rest"
                ? "bg-caution-amber"
                : "bg-gray-500"
          }`}
          aria-hidden="true"
        />
      </button>

      {/* ── Panel ── */}
      <div
        hidden={!open}
        className={`absolute top-full left-0 mt-1.5 w-[min(320px,calc(100vw-2rem))] z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        role="group"
        aria-label="DX cluster connection"
      >
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2 px-0.5">
          DX Cluster
        </div>

        <ClusterConnectionFormConnected compact />

        <Link
          to="/settings"
          className="block mt-2.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          onClick={() => setOpen(false)}
        >
          All connection settings →
        </Link>
      </div>
    </div>
  );
}

export default ClusterPopover;
