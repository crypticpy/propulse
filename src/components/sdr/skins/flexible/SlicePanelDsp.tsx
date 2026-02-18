/**
 * SlicePanelDsp — DSP controls panel for the slice flag.
 *
 * Radio-only DSP toggles (NB/NR/AGC/ANF/QSK/VOX) with progressive
 * disclosure for AGC speed and squelch. Client-side DSP is now in SlicePanelAud.
 */

import { useState } from "react";

interface SlicePanelDspProps {
  nbEnabled: boolean;
  nrEnabled: boolean;
  agcEnabled: boolean;
  agcMode: number;
  anfEnabled: boolean;
  qskEnabled: boolean;
  voxEnabled: boolean;
  squelchLevel: number;
  onNbToggle: () => void;
  onNrToggle: () => void;
  onAgcToggle: () => void;
  onAgcModeChange: (mode: number) => void;
  onAnfToggle: () => void;
  onQskToggle: () => void;
  onVoxToggle: () => void;
  onSquelchChange: (level: number) => void;
  canControl: boolean;
}

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
  qskEnabled,
  voxEnabled,
  squelchLevel,
  onNbToggle,
  onNrToggle,
  onAgcToggle,
  onAgcModeChange,
  onAnfToggle,
  onQskToggle,
  onVoxToggle,
  onSquelchChange,
  canControl,
}: SlicePanelDspProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const buttons = [
    { key: "nb", label: "NB", active: nbEnabled, onClick: onNbToggle },
    { key: "nr", label: "NR", active: nrEnabled, onClick: onNrToggle },
    { key: "agc", label: "AGC", active: agcEnabled, onClick: onAgcToggle },
    { key: "anf", label: "ANF", active: anfEnabled, onClick: onAnfToggle },
    { key: "qsk", label: "QSK", active: qskEnabled, onClick: onQskToggle },
    { key: "vox", label: "VOX", active: voxEnabled, onClick: onVoxToggle },
  ];

  return (
    <div className="space-y-2">
      <div
        className={
          buttons.length <= 4
            ? "grid grid-cols-4 gap-1"
            : "grid grid-cols-3 gap-1"
        }
      >
        {buttons.map((btn) => (
          <button
            key={btn.key}
            type="button"
            onClick={btn.onClick}
            disabled={!canControl}
            className={`px-2 py-1.5 text-[10px] font-bold uppercase rounded border transition-all
              disabled:cursor-not-allowed ${
                btn.active
                  ? "bg-signal-green/20 border-signal-green/30 text-signal-green shadow-[0_0_6px_rgba(0,255,136,0.15)]"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200 disabled:opacity-40"
              }`}
            title={`Toggle ${btn.label}`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((open) => !open)}
        className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
      >
        {showAdvanced ? "Hide DSP Fine Controls" : "Show DSP Fine Controls"}
      </button>

      {showAdvanced && (
        <div className="space-y-2 pt-0.5">
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
      )}
    </div>
  );
}
