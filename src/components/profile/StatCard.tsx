/**
 * Simple display card for a big stat number.
 * Shows a prominent value with a label and optional subtitle.
 */

export function StatCard({
  value,
  label,
  subtitle,
  className = "",
}: {
  value: string | number;
  label: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      className={`bg-panel/30 border border-white/5 rounded-lg p-4 text-center ${className}`}
    >
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
      <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">
        {label}
      </div>
      {subtitle && (
        <div className="text-[10px] text-gray-500 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}
