export interface ContestRunControlsProps {
  runMode: "run" | "sp";
  onRunModeChange: (mode: "run" | "sp") => void;
  sessionId: string | null;
  currentBand: string;
  currentMode: string;
  onBandChange: (band: string) => void;
  onModeChange: (mode: string) => void;
  onFocusEntry: () => void;
  onEndSession: () => void;
}

export function ContestRunControls({
  runMode,
  onRunModeChange,
  sessionId,
  currentBand,
  currentMode,
  onBandChange,
  onModeChange,
  onFocusEntry,
  onEndSession,
}: ContestRunControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Run / S&P mode */}
      <div className="flex items-center bg-black/30 border border-white/10 rounded-lg p-1">
        <button
          type="button"
          onClick={() => onRunModeChange("run")}
          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
            runMode === "run"
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
          title="Run mode"
        >
          RUN
        </button>
        <button
          type="button"
          onClick={() => onRunModeChange("sp")}
          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
            runMode === "sp"
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
          title="Search & Pounce mode"
        >
          S&amp;P
        </button>
      </div>

      {/* Band / Mode quick selects */}
      <select
        value={currentBand}
        disabled={!sessionId}
        onChange={(e) => onBandChange(e.target.value)}
        className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-cosmic-cyan font-mono text-xs focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        title="Operating band"
      >
        {["160m", "80m", "40m", "20m", "15m", "10m", "6m", "2m"].map((b) => (
          <option key={b} value={b} className="bg-deep-space">
            {b}
          </option>
        ))}
      </select>
      <select
        value={currentMode}
        disabled={!sessionId}
        onChange={(e) => onModeChange(e.target.value)}
        className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-white font-mono text-xs focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        title="Operating mode"
      >
        {["CW", "SSB", "RTTY", "FT8"].map((m) => (
          <option key={m} value={m} className="bg-deep-space">
            {m}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onFocusEntry}
        className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
        title="Focus entry (Alt+E)"
      >
        Focus
      </button>

      <button
        type="button"
        onClick={onEndSession}
        className="px-3 py-1 rounded-lg bg-alert-red/15 border border-alert-red/40 text-alert-red hover:bg-alert-red/25 transition-colors text-xs font-bold"
        title="End contest session"
      >
        End
      </button>
    </div>
  );
}

export default ContestRunControls;

