/**
 * DecodesPanel -- WSJT-X decodes + DX Cluster spots.
 * Shared between Classic and Flexible skins.
 */

import { Card } from "@/components/ui";
import type {
  WsjtxStatus,
  WsjtxDecode,
  ClusterSpotMessage,
} from "@/lib/radio/protocol";
import {
  formatHz,
  formatUtcMsSinceMidnight,
} from "@/components/sdr/skins/types";

export interface DecodesPanelProps {
  wsjtxStatus: WsjtxStatus | null;
  wsjtxDecodes: WsjtxDecode[];
  clusterSpots: ClusterSpotMessage[];
}

export function DecodesPanel({
  wsjtxStatus,
  wsjtxDecodes,
  clusterSpots,
}: DecodesPanelProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-su-text">
          Decodes &amp; Spots
        </div>
        <div className="text-xs text-su-muted">
          {wsjtxStatus ? "WSJT-X live" : "WSJT-X idle"} &bull;{" "}
          {clusterSpots.length} spots
        </div>
      </div>

      {wsjtxStatus ? (
        <div className="text-xs text-su-muted grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
          <div className="flex justify-between">
            <span>Dial</span>
            <span className="text-su-text font-mono">
              {formatHz(wsjtxStatus.frequency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Mode</span>
            <span className="text-su-text font-mono">{wsjtxStatus.mode}</span>
          </div>
          <div className="flex justify-between">
            <span>RX DF</span>
            <span className="text-su-text font-mono">
              {wsjtxStatus.rxDF} Hz
            </span>
          </div>
          <div className="flex justify-between">
            <span>TX DF</span>
            <span className="text-su-text font-mono">
              {wsjtxStatus.txDF} Hz
            </span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-su-muted mb-3">
          Start WSJT-X on this machine (UDP port 2237 by default) to see decodes
          here.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-su-text">
            WSJT-X Decodes
          </div>
          {wsjtxDecodes.length === 0 ? (
            <div className="text-xs text-su-muted">
              No decodes received yet.
            </div>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-auto pr-1">
              {wsjtxDecodes.slice(0, 10).map((d, idx) => (
                <div
                  key={`${d.time}-${d.deltaFrequency}-${idx}`}
                  className="flex items-center gap-2 text-xs px-2 py-1 rounded-md border border-su-line/40 bg-su-line/10"
                >
                  <span className="font-mono text-su-muted w-14">
                    {formatUtcMsSinceMidnight(d.time)}
                  </span>
                  <span className="font-mono text-su-muted w-10 text-right">
                    {d.snr > 0 ? `+${d.snr}` : d.snr}
                  </span>
                  <span className="font-mono text-su-muted w-14 text-right">
                    {d.deltaFrequency}Hz
                  </span>
                  <span className="text-su-text truncate min-w-0">
                    {d.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-su-text">
            DX Cluster Spots
          </div>
          {clusterSpots.length === 0 ? (
            <div className="text-xs text-su-muted">
              No spots received yet. Connect to a cluster in the daemon config
              or via the CLI/API.
            </div>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-auto pr-1">
              {clusterSpots.slice(0, 10).map((s, idx) => (
                <div
                  key={`${s.id ?? "spot"}-${idx}`}
                  className="flex items-center gap-2 text-xs px-2 py-1 rounded-md border border-su-line/40 bg-su-line/10"
                >
                  <span className="font-mono text-su-muted w-16 truncate">
                    {s.dx}
                  </span>
                  <span className="font-mono text-su-muted w-20 text-right">
                    {s.freq.toFixed(1)} kHz
                  </span>
                  <span className="text-su-text truncate min-w-0">
                    {s.comment}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
