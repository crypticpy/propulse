/**
 * FlexButtonBar — Left vertical button bar for the FlexRadio SmartSDR skin.
 *
 * 48px-wide column with stacked icon buttons for antenna cycling, band
 * selection (future), display mode (future), and placeholder controls.
 */

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FlexButtonBarProps {
  /** Whether the connected radio has multiple antennas */
  hasMultipleAntennas: boolean;
  /** Current antenna port */
  antenna: string | null;
  /** Available antenna ports */
  antennas: string[];
  /** Callback to cycle antenna */
  onAntennaChange: (port: string) => void;
  /** Whether radio supports FFT */
  canStreamFft: boolean;
  /** Whether FFT is currently streaming */
  fftEnabled: boolean;
  /** Toggle FFT on/off */
  onToggleFft: () => void;
  /** Whether a radio is connected */
  hasRadio: boolean;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const DISABLED_BTN =
  "w-10 h-8 rounded text-[9px] font-medium bg-white/5 text-gray-600 opacity-40 cursor-not-allowed border border-white/5";

const FUNCTIONAL_BTN =
  "w-10 h-8 rounded text-[9px] font-medium bg-white/5 text-gray-200 border border-white/10 hover:bg-white/15 active:bg-white/20";

// ─── Component ───────────────────────────────────────────────────────────────

export function FlexButtonBar({
  hasMultipleAntennas,
  antenna,
  antennas,
  onAntennaChange,
  hasRadio,
}: FlexButtonBarProps) {
  const antennaEnabled = hasRadio && hasMultipleAntennas && antennas.length > 1;

  function handleAntennaCycle() {
    if (!antennaEnabled) return;
    const currentIdx = antennas.indexOf(antenna ?? "");
    const nextIdx = (currentIdx + 1) % antennas.length;
    onAntennaChange(antennas[nextIdx]);
  }

  return (
    <div className="flex flex-col items-center w-12 shrink-0 bg-[#0d0d14] border-r border-white/10 py-2 gap-1">
      {/* ── Top group: functional buttons ─────────────────────────────── */}

      {/* Band — disabled placeholder (Wave 5) */}
      <button disabled title="Coming in Wave 5" className={DISABLED_BTN}>
        Band
      </button>

      {/* ANT — cycle antennas */}
      <button
        disabled={!antennaEnabled}
        title={
          antennaEnabled ? `Antenna: ${antenna ?? "?"}` : "Not yet available"
        }
        className={antennaEnabled ? FUNCTIONAL_BTN : DISABLED_BTN}
        onClick={handleAntennaCycle}
      >
        <div className="flex flex-col items-center leading-tight">
          <span>ANT</span>
          {antennaEnabled && antenna && (
            <span className="text-[8px] text-gray-500">{antenna}</span>
          )}
        </div>
      </button>

      {/* Disp — disabled placeholder */}
      <button disabled title="Not yet available" className={DISABLED_BTN}>
        Disp
      </button>

      {/* ── Spacer ────────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Bottom group: disabled placeholders ───────────────────────── */}

      {/* +RX — add receiver (future) */}
      <button disabled title="Not yet available" className={DISABLED_BTN}>
        +RX
      </button>

      {/* +TNF — tracking notch filter (future) */}
      <button disabled title="Not yet available" className={DISABLED_BTN}>
        +TNF
      </button>

      {/* DAX — digital audio exchange (future) */}
      <button disabled title="Not yet available" className={DISABLED_BTN}>
        DAX
      </button>
    </div>
  );
}
