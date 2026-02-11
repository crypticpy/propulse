/**
 * HelpFeatureCompare — Free vs Pro comparison row.
 *
 * Desktop: 3-column grid layout.
 * Mobile: stacked layout with labeled tiers for readability.
 */

import { useIsMobile } from "@/hooks/useIsMobile";

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
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="py-3 border-b border-white/5 last:border-b-0 space-y-1.5">
        <span className="text-sm text-gray-200 font-medium block">
          {feature}
        </span>
        <div className="flex items-start gap-2 pl-1">
          <span className="shrink-0 text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-10 mt-0.5">
            Free
          </span>
          <span className="text-xs text-gray-400">{free}</span>
        </div>
        <div className="flex items-start gap-2 pl-1">
          <span className="shrink-0 text-[10px] font-semibold text-purple-400 uppercase tracking-wider w-10 mt-0.5">
            Pro
          </span>
          <span className="text-xs text-purple-300">{pro}</span>
        </div>
      </div>
    );
  }

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
  const isMobile = useIsMobile();

  return (
    <div className="my-3 rounded-lg border border-white/5 px-4 py-2">
      {/* Header — hidden on mobile (labels are inline in mobile card layout) */}
      {!isMobile && (
        <div className="grid grid-cols-3 gap-3 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider">
          <span className="text-gray-500">Feature</span>
          <span className="text-gray-500">Free</span>
          <span className="text-purple-400">Pro</span>
        </div>
      )}
      {rows.map((row, i) => (
        <HelpFeatureCompare key={i} {...row} />
      ))}
    </div>
  );
}
