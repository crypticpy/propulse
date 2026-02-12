/**
 * InterestTagPicker — Owner-only editable tag selector for operator interests.
 *
 * Displays all predefined interest tags organized by category with
 * collapsible sections, search filtering, and a selection counter.
 * Selected tags are capped at MAX_INTEREST_TAGS (15).
 */

import { useState, useMemo } from "react";
import type { InterestTag, InterestCategory } from "@/types/social";
import {
  INTEREST_CATEGORIES,
  INTEREST_TAGS,
  MAX_INTEREST_TAGS,
} from "@/lib/data/interestTags";

interface InterestTagPickerProps {
  selected: InterestTag[];
  onChange: (tags: InterestTag[]) => void;
  maxTags?: number;
}

const CATEGORY_ORDER: InterestCategory[] = [
  "operating",
  "modes",
  "technical",
  "community",
];

export function InterestTagPicker({
  selected,
  onChange,
  maxTags = MAX_INTEREST_TAGS,
}: InterestTagPickerProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const atMax = selected.length >= maxTags;

  const isSelected = useMemo(() => {
    const set = new Set(selected.map((t) => `${t.category}::${t.tag}`));
    return (category: InterestCategory, tag: string) =>
      set.has(`${category}::${tag}`);
  }, [selected]);

  const filteredTags = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return INTEREST_TAGS;

    const result: Record<InterestCategory, string[]> = {
      operating: [],
      modes: [],
      technical: [],
      community: [],
    };

    for (const cat of CATEGORY_ORDER) {
      result[cat] = INTEREST_TAGS[cat].filter((tag) =>
        tag.toLowerCase().includes(term),
      );
    }

    return result;
  }, [search]);

  const toggleTag = (category: InterestCategory, tag: string) => {
    const key = `${category}::${tag}`;
    const exists = selected.some((t) => `${t.category}::${t.tag}` === key);

    if (exists) {
      onChange(selected.filter((t) => `${t.category}::${t.tag}` !== key));
    } else if (!atMax) {
      onChange([...selected, { category, tag }]);
    }
  };

  const toggleCollapse = (category: string) => {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const counterColor = atMax ? "text-amber-400" : "text-gray-400";

  return (
    <div className="space-y-3">
      {/* Header + counter */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
          Interests
        </span>
        <span className={`text-xs font-medium ${counterColor}`}>
          {selected.length}/{maxTags} selected
        </span>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter tags..."
        className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs
                   text-gray-200 placeholder-gray-600 focus:border-plasma-orange/40 focus:outline-none transition-colors"
      />

      {/* Category sections */}
      <div className="space-y-2">
        {CATEGORY_ORDER.map((cat) => {
          const def = INTEREST_CATEGORIES[cat];
          const tags = filteredTags[cat];

          if (tags.length === 0) return null;

          const isCollapsed = collapsed[cat] ?? false;

          return (
            <div key={cat}>
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCollapse(cat)}
                className="flex items-center gap-1.5 w-full text-left py-1 group"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-3 h-3 text-gray-500 transition-transform ${
                    isCollapsed ? "-rotate-90" : ""
                  }`}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
                <span
                  className="text-[10px] uppercase tracking-widest font-medium"
                  style={{ color: def.color }}
                >
                  {def.label}
                </span>
              </button>

              {/* Tags */}
              {!isCollapsed && (
                <div className="flex flex-wrap gap-1.5 pt-1 pb-1">
                  {tags.map((tag) => {
                    const sel = isSelected(cat, tag);
                    const disabled = !sel && atMax;

                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleTag(cat, tag)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${
                          sel
                            ? "text-white"
                            : disabled
                              ? "bg-white/[0.03] border-white/5 text-gray-600 opacity-50 cursor-not-allowed"
                              : "bg-white/[0.06] border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20 cursor-pointer"
                        }`}
                        style={
                          sel
                            ? {
                                backgroundColor: `${def.color}20`,
                                borderColor: `${def.color}66`,
                                color: def.color,
                              }
                            : undefined
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
