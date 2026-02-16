/**
 * SlicePanelDsp — DSP controls panel for the slice flag.
 *
 * NB, NR, AGC toggle buttons with enhanced visual feedback.
 * ANF placeholder for future implementation.
 */

interface SlicePanelDspProps {
  nbEnabled: boolean;
  nrEnabled: boolean;
  agcEnabled: boolean;
  onNbToggle: () => void;
  onNrToggle: () => void;
  onAgcToggle: () => void;
  canControl: boolean;
}

const DSP_BUTTONS: {
  key: "nb" | "nr" | "agc" | "anf";
  label: string;
  placeholder?: boolean;
}[] = [
  { key: "nb", label: "NB" },
  { key: "nr", label: "NR" },
  { key: "agc", label: "AGC" },
  { key: "anf", label: "ANF", placeholder: true },
];

export function SlicePanelDsp({
  nbEnabled,
  nrEnabled,
  agcEnabled,
  onNbToggle,
  onNrToggle,
  onAgcToggle,
  canControl,
}: SlicePanelDspProps) {
  const stateMap: Record<string, boolean> = {
    nb: nbEnabled,
    nr: nrEnabled,
    agc: agcEnabled,
    anf: false,
  };

  const toggleMap: Record<string, (() => void) | undefined> = {
    nb: onNbToggle,
    nr: onNrToggle,
    agc: onAgcToggle,
    anf: undefined,
  };

  return (
    <div className="space-y-2">
      {/* Toggle button row */}
      <div className="grid grid-cols-4 gap-1">
        {DSP_BUTTONS.map((btn) => {
          const active = stateMap[btn.key];
          const handler = toggleMap[btn.key];
          const disabled = !canControl || btn.placeholder;

          return (
            <button
              key={btn.key}
              type="button"
              onClick={handler}
              disabled={disabled}
              className={`px-2 py-1.5 text-[10px] font-bold uppercase rounded border transition-all
                disabled:cursor-not-allowed ${
                  btn.placeholder
                    ? "opacity-30 border-white/5 bg-white/[0.02] text-gray-600"
                    : active
                      ? "bg-signal-green/20 border-signal-green/30 text-signal-green shadow-[0_0_6px_rgba(0,255,136,0.15)]"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200 disabled:opacity-40"
                }`}
              title={
                btn.placeholder ? "Not yet available" : `Toggle ${btn.label}`
              }
            >
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
