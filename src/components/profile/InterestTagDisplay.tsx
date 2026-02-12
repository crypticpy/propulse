/**
 * InterestTagDisplay — Read-only display of operator interest tags.
 *
 * Renders colored pills grouped by category. Supports a compact
 * single-row mode for sidebar use and an optional viewer-tag
 * highlight to show shared interests between operators.
 */

import type { InterestTag, InterestCategory } from "@/types/social";
import { INTEREST_CATEGORIES } from "@/lib/data/interestTags";

interface InterestTagDisplayProps {
  tags: InterestTag[];
  viewerTags?: InterestTag[];
  compact?: boolean;
}

const CATEGORY_ORDER: InterestCategory[] = [
  "operating",
  "modes",
  "technical",
  "community",
];

export function InterestTagDisplay({
  tags,
  viewerTags,
  compact = false,
}: InterestTagDisplayProps) {
  if (tags.length === 0) return null;

  // Build a set of viewer tag keys for match detection
  const viewerSet = viewerTags
    ? new Set(viewerTags.map((t) => `${t.category}::${t.tag}`))
    : null;

  // Group tags by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    def: INTEREST_CATEGORIES[cat],
    items: tags.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0);

  // ─── Compact mode: single row with overflow fade ──────────────────────

  if (compact) {
    return (
      <div className="relative max-h-7 overflow-hidden">
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => {
            const def = INTEREST_CATEGORIES[t.category];
            const isMatch = viewerSet?.has(`${t.category}::${t.tag}`);

            return (
              <span
                key={`${t.category}::${t.tag}`}
                className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 ${
                  isMatch ? "ring-1" : ""
                }`}
                style={{
                  backgroundColor: `${def.color}26`,
                  color: def.color,
                  ...(isMatch
                    ? {
                        ringColor: `${def.color}80`,
                        boxShadow: `0 0 0 1px ${def.color}80`,
                      }
                    : {}),
                }}
              >
                {t.tag}
              </span>
            );
          })}
        </div>
        {/* Right-side fade gradient */}
        <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-void-black to-transparent pointer-events-none" />
      </div>
    );
  }

  // ─── Full mode: grouped by category ───────────────────────────────────

  return (
    <div className="space-y-2.5">
      {grouped.map(({ category, def, items }) => (
        <div key={category}>
          <span
            className="block text-[10px] uppercase tracking-widest mb-1"
            style={{ color: `${def.color}99` }}
          >
            {def.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {items.map((t) => {
              const isMatch = viewerSet?.has(`${t.category}::${t.tag}`);

              return (
                <span
                  key={t.tag}
                  className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${
                    isMatch ? "ring-1" : ""
                  }`}
                  style={{
                    backgroundColor: `${def.color}26`,
                    color: def.color,
                    ...(isMatch
                      ? {
                          ringColor: `${def.color}80`,
                          boxShadow: `0 0 0 1px ${def.color}80`,
                        }
                      : {}),
                  }}
                >
                  {t.tag}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
