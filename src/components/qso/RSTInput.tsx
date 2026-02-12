/**
 * RSTInput — Side-by-side RST Sent / RST Received inputs.
 *
 * Auto-filled by mode via the store's setField logic.
 * Shows subtle green left border when auto-filled from defaults.
 */

import { getRSTDefault } from "@/lib/utils/rstDefaults";

export interface RSTInputProps {
  rstSent: string;
  rstRcvd: string;
  mode: string;
  onRstSentChange: (value: string) => void;
  onRstRcvdChange: (value: string) => void;
}

export function RSTInput({
  rstSent,
  rstRcvd,
  mode,
  onRstSentChange,
  onRstRcvdChange,
}: RSTInputProps) {
  const modeDefault = getRSTDefault(mode);
  const sentIsDefault = rstSent === modeDefault;
  const rcvdIsDefault = rstRcvd === modeDefault;

  return (
    <div className="flex items-center gap-3">
      {/* RST Sent */}
      <div className="flex-1">
        <label
          htmlFor="qso-rst-sent"
          className="block text-xs text-gray-500 mb-1"
        >
          RST Sent
        </label>
        <input
          id="qso-rst-sent"
          aria-label="RST Sent"
          type="text"
          inputMode="numeric"
          value={rstSent}
          onChange={(e) => onRstSentChange(e.target.value)}
          placeholder={modeDefault}
          className={`
            w-full h-10 px-3
            bg-white/5 border rounded-lg
            text-white text-sm font-mono text-center
            placeholder-gray-500
            focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
            focus:outline-none
            transition-colors
            ${sentIsDefault ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
          `}
        />
      </div>

      {/* RST Received */}
      <div className="flex-1">
        <label
          htmlFor="qso-rst-rcvd"
          className="block text-xs text-gray-500 mb-1"
        >
          RST Rcvd
        </label>
        <input
          id="qso-rst-rcvd"
          aria-label="RST Received"
          type="text"
          inputMode="numeric"
          value={rstRcvd}
          onChange={(e) => onRstRcvdChange(e.target.value)}
          placeholder={modeDefault}
          className={`
            w-full h-10 px-3
            bg-white/5 border rounded-lg
            text-white text-sm font-mono text-center
            placeholder-gray-500
            focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
            focus:outline-none
            transition-colors
            ${rcvdIsDefault ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
          `}
        />
      </div>
    </div>
  );
}
