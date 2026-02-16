/**
 * MUFLegend Component
 *
 * Displays a compact legend explaining MUF 8-band color coding.
 * Shows frequency ranges and corresponding ham band allocations.
 *
 * Color stops match the GLSL shader in MUFOverlay.tsx:
 *   <3 MHz   deep maroon     (nighttime, no HF)
 *   3-5 MHz  red/orange      (80m/60m)
 *   5-7 MHz  orange          (40m)
 *   7-10 MHz amber           (40m-30m)
 *   10-14 MHz yellow-green   (30m-20m)
 *   14-21 MHz green          (20m-15m)
 *   21-28 MHz cyan           (15m-10m)
 *   >28 MHz  blue-violet     (10m+)
 */

interface MUFLegendProps {
  /** Additional CSS classes */
  className?: string;
}

const MUF_BANDS = [
  { color: "rgb(115,20,31)", label: "< 3", bands: "No HF" },
  { color: "rgb(217,46,38)", label: "3-5", bands: "80m" },
  { color: "rgb(242,128,26)", label: "5-7", bands: "40m" },
  { color: "rgb(242,184,26)", label: "7-10", bands: "30m" },
  { color: "rgb(191,224,51)", label: "10-14", bands: "20m" },
  { color: "rgb(38,199,102)", label: "14-21", bands: "15m" },
  { color: "rgb(26,184,217)", label: "21-28", bands: "10m" },
  { color: "rgb(77,89,235)", label: "> 28", bands: "6m+" },
];

export function MUFLegend({ className = "" }: MUFLegendProps) {
  return (
    <div className={`flex items-center gap-3 text-xs ${className}`}>
      <span className="text-gray-500 font-medium">MUF:</span>
      {MUF_BANDS.map((band) => (
        <div key={band.label} className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: band.color, opacity: 0.85 }}
          />
          <span className="text-gray-400">{band.label}</span>
        </div>
      ))}
      <span className="text-gray-500">MHz</span>
    </div>
  );
}

/**
 * Compact inline legend for space-constrained areas (gradient bar)
 */
export function MUFLegendCompact({ className = "" }: MUFLegendProps) {
  return (
    <div className={`flex items-center gap-2 text-[10px] ${className}`}>
      <span className="text-gray-500">MUF:</span>
      <div className="flex items-center gap-0.5">
        {MUF_BANDS.map((band) => (
          <div
            key={band.label}
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: band.color, opacity: 0.85 }}
            title={`${band.label} MHz (${band.bands})`}
          />
        ))}
      </div>
      <span className="text-gray-500">Low-High</span>
    </div>
  );
}
