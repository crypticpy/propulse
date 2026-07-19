import { memo, useState, useEffect } from "react";

export interface FlexBottomBarProps {
  daemonConnected: boolean;
  radioName: string | null;
  ptt: boolean;
  fftEnabled: boolean;
  cpuPercent: number | null;
  memoryMb: number | null;
  vfo?: "A" | "B" | null;
  activeBand?: string | null;
}

function formatUtc(): string {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}Z`;
}

export const FlexBottomBar = memo(function FlexBottomBar({
  daemonConnected,
  radioName,
  ptt,
  fftEnabled,
  cpuPercent,
  memoryMb,
  vfo,
  activeBand,
}: FlexBottomBarProps) {
  const [utc, setUtc] = useState(() => formatUtc());

  useEffect(() => {
    const id = setInterval(() => setUtc(formatUtc()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex w-full items-center justify-between bg-[#0d0d14] border-t border-white/10 px-3 h-8 shrink-0">
      {/* Left section -- placeholder buttons */}
      <div className="flex items-center gap-1.5">
        <button
          disabled
          title="Not yet available"
          className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/5 text-gray-600 opacity-50 cursor-not-allowed"
        >
          TNF
        </button>
        <button
          disabled
          title="Not yet available"
          className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/5 text-gray-600 opacity-50 cursor-not-allowed"
        >
          CWX
        </button>
      </div>

      {/* Center section -- daemon status */}
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            daemonConnected ? "bg-green-500" : "bg-gray-600"
          }`}
        />
        <span>{radioName ?? "No Radio"}</span>
        {vfo && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-white/10 text-gray-300">
            VFO {vfo}
          </span>
        )}
        {activeBand && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-white/10 text-gray-300">
            {activeBand}
          </span>
        )}
        {cpuPercent != null && memoryMb != null && (
          <span className="font-mono text-[10px] text-gray-500">
            CPU {cpuPercent.toFixed(0)}% &middot; {memoryMb.toFixed(0)} MB
          </span>
        )}
      </div>

      {/* Right section -- LIVE indicator, TX badge, UTC clock */}
      <div className="flex items-center gap-3">
        {/* LIVE / IDLE indicator */}
        <div className="flex items-center gap-1 text-[10px] font-medium">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              fftEnabled ? "bg-green-500 animate-pulse" : "bg-gray-600"
            }`}
          />
          <span className={fftEnabled ? "text-green-400" : "text-gray-600"}>
            {fftEnabled ? "LIVE" : "IDLE"}
          </span>
        </div>

        {/* TX badge */}
        {ptt && (
          <span className="animate-pulse rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
            TX
          </span>
        )}

        {/* UTC clock */}
        <span className="font-mono text-[11px] text-gray-400">{utc}</span>
      </div>
    </div>
  );
});
