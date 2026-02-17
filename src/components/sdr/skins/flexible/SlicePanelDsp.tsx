/**
 * SlicePanelDsp — DSP controls panel for the slice flag.
 *
 * NB, NR, AGC, ANF toggle buttons + AGC speed selector + squelch slider.
 */

interface SlicePanelDspProps {
  nbEnabled: boolean;
  nrEnabled: boolean;
  agcEnabled: boolean;
  agcMode: number;
  anfEnabled: boolean;
  squelchLevel: number;
  onNbToggle: () => void;
  onNrToggle: () => void;
  onAgcToggle: () => void;
  onAgcModeChange: (mode: number) => void;
  onAnfToggle: () => void;
  onSquelchChange: (level: number) => void;
  canControl: boolean;
}

const DSP_BUTTONS: {
  key: "nb" | "nr" | "agc" | "anf";
  label: string;
}[] = [
  { key: "nb", label: "NB" },
  { key: "nr", label: "NR" },
  { key: "agc", label: "AGC" },
  { key: "anf", label: "ANF" },
];

const AGC_MODES: { mode: number; label: string }[] = [
  { mode: 0, label: "OFF" },
  { mode: 1, label: "FAST" },
  { mode: 2, label: "MED" },
  { mode: 3, label: "SLOW" },
];

export function SlicePanelDsp({
  nbEnabled,
  nrEnabled,
  agcEnabled,
  agcMode,
  anfEnabled,
  squelchLevel,
  onNbToggle,
  onNrToggle,
  onAgcToggle,
  onAgcModeChange,
  onAnfToggle,
  onSquelchChange,
  canControl,
}: SlicePanelDspProps) {
  const stateMap: Record<string, boolean> = {
    nb: nbEnabled,
    nr: nrEnabled,
    agc: agcEnabled,
    anf: anfEnabled,
  };

  const toggleMap: Record<string, (() => void) | undefined> = {
    nb: onNbToggle,
    nr: onNrToggle,
    agc: onAgcToggle,
    anf: onAnfToggle,
  };

  return (
    <div className="space-y-2">
      {/* Toggle button row */}
      <div className="grid grid-cols-4 gap-1">
        {DSP_BUTTONS.map((btn) => {
          const active = stateMap[btn.key];
          const handler = toggleMap[btn.key];
          const disabled = !canControl;

          return (
            <button
              key={btn.key}
              type="button"
              onClick={handler}
              disabled={disabled}
              className={`px-2 py-1.5 text-[10px] font-bold uppercase rounded border transition-all
                disabled:cursor-not-allowed ${
                  active
                    ? "bg-signal-green/20 border-signal-green/30 text-signal-green shadow-[0_0_6px_rgba(0,255,136,0.15)]"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200 disabled:opacity-40"
                }`}
              title={`Toggle ${btn.label}`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* AGC speed selector — only when AGC is on */}
      {agcEnabled && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">
            AGC Speed
          </div>
          <div className="grid grid-cols-4 gap-0.5">
            {AGC_MODES.map((a) => (
              <button
                key={a.mode}
                type="button"
                onClick={() => onAgcModeChange(a.mode)}
                disabled={!canControl}
                className={`px-1 py-1 text-[9px] font-bold rounded border transition-colors
                  disabled:cursor-not-allowed ${
                    agcMode === a.mode
                      ? "bg-cosmic-cyan/20 border-cosmic-cyan/40 text-cosmic-cyan"
                      : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-40"
                  }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Squelch slider */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">
            Squelch
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            {Math.round(squelchLevel * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(squelchLevel * 100)}
          onChange={(e) => onSquelchChange(Number(e.target.value) / 100)}
          disabled={!canControl}
          className="w-full h-1 accent-plasma-orange disabled:opacity-40"
        />
      </div>
    </div>
  );
}
