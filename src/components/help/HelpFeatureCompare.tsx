/**
 * HelpFeatureCompare — Free vs Pro comparison row.
 */

export interface FeatureCompareProps {
  feature: string;
  free: string;
  pro: string;
}

export function HelpFeatureCompare({
  feature,
  free,
  pro,
}: FeatureCompareProps) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-white/5 last:border-b-0 text-sm">
      <span className="text-gray-200 font-medium">{feature}</span>
      <span className="text-gray-400">{free}</span>
      <span className="text-purple-300">{pro}</span>
    </div>
  );
}

interface FeatureCompareTableProps {
  rows: FeatureCompareProps[];
}

export function HelpFeatureCompareTable({ rows }: FeatureCompareTableProps) {
  return (
    <div className="my-3 rounded-lg border border-white/5 px-4 py-2">
      {/* Header */}
      <div className="grid grid-cols-3 gap-3 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider">
        <span className="text-gray-500">Feature</span>
        <span className="text-gray-500">Free</span>
        <span className="text-purple-400">Pro</span>
      </div>
      {rows.map((row, i) => (
        <HelpFeatureCompare key={i} {...row} />
      ))}
    </div>
  );
}
