/**
 * MUFLegend Component
 *
 * Displays a compact legend explaining MUF color coding.
 * Shows frequency ranges and corresponding band allocations.
 */

interface MUFLegendProps {
  /** Additional CSS classes */
  className?: string;
}

const MUF_BANDS = [
  { color: "#ef4444", label: "< 7 MHz", bands: "80m-160m" },
  { color: "#eab308", label: "7-14 MHz", bands: "40m-20m" },
  { color: "#22c55e", label: "14-21 MHz", bands: "20m-15m" },
  { color: "#3b82f6", label: "> 21 MHz", bands: "15m-10m" },
];

export function MUFLegend({ className = "" }: MUFLegendProps) {
  return (
    <div className={`flex items-center gap-3 text-xs ${className}`}>
      <span className="text-gray-500 font-medium">MUF:</span>
      {MUF_BANDS.map((band) => (
        <div key={band.label} className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: band.color, opacity: 0.8 }}
          />
          <span className="text-gray-400">{band.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Compact inline legend for space-constrained areas
 */
export function MUFLegendCompact({ className = "" }: MUFLegendProps) {
  return (
    <div className={`flex items-center gap-2 text-[10px] ${className}`}>
      <span className="text-gray-500">MUF:</span>
      <div className="flex items-center gap-0.5">
        <div
          className="w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: "#ef4444", opacity: 0.8 }}
          title="< 7 MHz (80m-160m)"
        />
        <div
          className="w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: "#eab308", opacity: 0.8 }}
          title="7-14 MHz (40m-20m)"
        />
        <div
          className="w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: "#22c55e", opacity: 0.8 }}
          title="14-21 MHz (20m-15m)"
        />
        <div
          className="w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: "#3b82f6", opacity: 0.8 }}
          title="> 21 MHz (15m-10m)"
        />
      </div>
      <span className="text-gray-500">Low-High</span>
    </div>
  );
}
