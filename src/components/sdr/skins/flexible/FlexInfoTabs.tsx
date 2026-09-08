/**
 * FlexInfoTabs — Tabbed information panel for the Flexible skin sidebar.
 *
 * Three tabs: Decodes (WSJT-X + native FT8), Spots (DX Cluster), and WSJT-X status.
 * Auto-switches to Decodes tab when native FT8 decoder is active.
 * Renders compact rows optimized for the 280px sidebar width.
 */

import { memo, useEffect, useRef, useState } from "react";
import type {
  WsjtxStatus,
  WsjtxDecode,
  ClusterSpotMessage,
} from "@/lib/radio/protocol";
import {
  formatHz,
  formatUtcMsSinceMidnight,
} from "@/components/sdr/skins/types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FlexInfoTabsProps {
  wsjtxStatus: WsjtxStatus | null;
  wsjtxDecodes: WsjtxDecode[];
  clusterSpots: ClusterSpotMessage[];
  /** When true, auto-switches to Decodes tab and shows NATIVE badge. */
  ft8DecoderEnabled: boolean;
}

// ─── Tab type ────────────────────────────────────────────────────────────────

type InfoTab = "decodes" | "spots" | "wsjtx";

const TAB_LABELS: Record<InfoTab, string> = {
  decodes: "Decodes",
  spots: "Spots",
  wsjtx: "WSJT-X",
};

// ─── Component ───────────────────────────────────────────────────────────────

export const FlexInfoTabs = memo(function FlexInfoTabs({
  wsjtxStatus,
  wsjtxDecodes,
  clusterSpots,
  ft8DecoderEnabled,
}: FlexInfoTabsProps) {
  const [activeTab, setActiveTab] = useState<InfoTab>("decodes");

  // Auto-switch to Decodes when FT8 decoder turns on
  const prevEnabledRef = useRef(ft8DecoderEnabled);
  useEffect(() => {
    if (ft8DecoderEnabled && !prevEnabledRef.current) {
      setActiveTab("decodes");
    }
    prevEnabledRef.current = ft8DecoderEnabled;
  }, [ft8DecoderEnabled]);

  return (
    <div className="flex flex-col border-t border-su-line/40">
      {/* ── Tab pills ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#0d0d14]">
        {(Object.keys(TAB_LABELS) as InfoTab[]).map((tab) => {
          const isActive = activeTab === tab;
          let badge: string | null = null;
          if (tab === "decodes" && wsjtxDecodes.length > 0)
            badge = String(Math.min(wsjtxDecodes.length, 99));
          if (tab === "spots" && clusterSpots.length > 0)
            badge = String(Math.min(clusterSpots.length, 99));
          if (tab === "wsjtx" && wsjtxStatus) badge = "\u2022";

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-cosmic-cyan/15 text-cosmic-cyan"
                  : "text-su-muted hover:text-su-text"
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === "decodes" && ft8DecoderEnabled && (
                <span className="ml-1 text-[7px] text-signal-green/80 font-bold">
                  LIVE
                </span>
              )}
              {badge && (
                <span
                  className={`ml-1 text-[8px] ${
                    isActive ? "text-cosmic-cyan/70" : "text-su-muted"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 min-h-[120px] max-h-[240px]">
        {activeTab === "decodes" && <DecodesTab decodes={wsjtxDecodes} />}
        {activeTab === "spots" && <SpotsTab spots={clusterSpots} />}
        {activeTab === "wsjtx" && <WsjtxTab status={wsjtxStatus} />}
      </div>
    </div>
  );
});

// ─── Decodes tab ─────────────────────────────────────────────────────────────

function DecodesTab({ decodes }: { decodes: WsjtxDecode[] }) {
  if (decodes.length === 0) {
    return (
      <div className="text-[10px] text-su-muted py-2">
        No decodes received yet.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {decodes.slice(0, 15).map((d, idx) => (
        <div
          key={`${d.time}-${d.deltaFrequency}-${idx}`}
          className="flex items-center gap-1.5 text-[10px] px-1 py-0.5 rounded bg-su-line/10 hover:bg-su-line/20"
        >
          <span className="font-mono text-su-muted w-12 shrink-0">
            {formatUtcMsSinceMidnight(d.time)}
          </span>
          <span className="font-mono text-su-muted w-7 text-right shrink-0">
            {d.snr > 0 ? `+${d.snr}` : d.snr}
          </span>
          <span className="font-mono text-su-muted w-10 text-right shrink-0">
            {d.deltaFrequency}
          </span>
          <span className="text-su-muted truncate min-w-0">{d.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Spots tab ───────────────────────────────────────────────────────────────

function SpotsTab({ spots }: { spots: ClusterSpotMessage[] }) {
  if (spots.length === 0) {
    return (
      <div className="text-[10px] text-su-muted py-2">
        No DX cluster spots yet.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {spots.slice(0, 15).map((s, idx) => (
        <div
          key={`${s.id ?? "spot"}-${idx}`}
          className="flex items-center gap-1.5 text-[10px] px-1 py-0.5 rounded bg-su-line/10 hover:bg-su-line/20"
        >
          <span className="font-mono text-su-muted w-14 truncate shrink-0">
            {s.dx}
          </span>
          <span className="font-mono text-su-muted w-16 text-right shrink-0">
            {s.freq.toFixed(1)}
          </span>
          <span className="text-su-muted truncate min-w-0">{s.comment}</span>
        </div>
      ))}
    </div>
  );
}

// ─── WSJT-X status tab ──────────────────────────────────────────────────────

function WsjtxTab({ status }: { status: WsjtxStatus | null }) {
  if (!status) {
    return (
      <div className="text-[10px] text-su-muted py-2">
        WSJT-X not connected. Start WSJT-X on this machine (UDP 2237) to see
        status here.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {[
        { label: "Dial", value: formatHz(status.frequency) },
        { label: "Mode", value: status.mode },
        { label: "RX DF", value: `${status.rxDF} Hz` },
        { label: "TX DF", value: `${status.txDF} Hz` },
        { label: "TX Enabled", value: status.txEnabled ? "Yes" : "No" },
        { label: "Decoding", value: status.decoding ? "Yes" : "No" },
      ].map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between text-[10px]"
        >
          <span className="text-su-muted">{row.label}</span>
          <span className="text-su-muted font-mono">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
