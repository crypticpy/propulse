/**
 * VisibilitySettings — Per-section privacy controls for the Social tab.
 *
 * Renders a matrix: 5 profile sections x 3 visibility levels.
 * Persists to profileStore via visibilitySettings field.
 */

import { useCallback, type KeyboardEvent } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useProfileStore } from "@/stores/profileStore";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type {
  VisibilitySettings as VisibilitySettingsType,
  VisibilityLevel,
} from "@/types/social";

// ── Constants ───────────────────────────────────────────────────────────

type SectionKey = keyof VisibilitySettingsType;

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "stats", label: "Stats" },
  { key: "awards", label: "Awards" },
  { key: "equipment", label: "Equipment" },
  { key: "activity", label: "Activity" },
  { key: "location", label: "Location" },
];

const LEVELS: { value: VisibilityLevel; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "friends", label: "Friends Only" },
  { value: "private", label: "Private" },
];

function radioGroupLabel(sectionLabel: string): string {
  return `${sectionLabel} visibility`;
}

function radioOptionLabel(sectionLabel: string, levelLabel: string): string {
  return `${sectionLabel}: ${levelLabel}`;
}

function moveRadioSelection(
  current: VisibilityLevel,
  key: string,
): VisibilityLevel | null {
  const index = LEVELS.findIndex((level) => level.value === current);
  if (index < 0) return null;

  if (key === "ArrowRight" || key === "ArrowDown") {
    return LEVELS[(index + 1) % LEVELS.length].value;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return LEVELS[(index - 1 + LEVELS.length) % LEVELS.length].value;
  }
  if (key === "Home") return LEVELS[0].value;
  if (key === "End") return LEVELS[LEVELS.length - 1].value;
  return null;
}

// ── Component ───────────────────────────────────────────────────────────

export function VisibilitySettings() {
  const isMobile = useIsMobile();
  const settings = useProfileStore((s) => s.visibilitySettings);
  const setVisibilitySettings = useProfileStore((s) => s.setVisibilitySettings);
  const requireAuth = useRequireAuth();

  const handleChange = useCallback(
    (section: SectionKey, level: VisibilityLevel) => {
      requireAuth(
        () => setVisibilitySettings({ [section]: level }),
        "Sign in to manage profile visibility",
      );
    },
    [setVisibilitySettings, requireAuth],
  );

  const handleRadioKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLElement>,
      section: SectionKey,
      selected: VisibilityLevel,
    ) => {
      const next = moveRadioSelection(selected, event.key);
      if (!next || next === selected) return;
      event.preventDefault();
      handleChange(section, next);
    },
    [handleChange],
  );

  // ── Mobile: stacked cards ───────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Visibility Settings
        </h3>

        {SECTIONS.map((section) => (
          <div
            key={section.key}
            className="bg-panel/30 border border-white/5 rounded-lg p-3 space-y-2"
          >
            <span className="text-sm font-medium text-gray-300">
              {section.label}
            </span>
            <div
              role="radiogroup"
              aria-label={radioGroupLabel(section.label)}
              className="flex gap-2"
              onKeyDown={(event) =>
                handleRadioKeyDown(
                  event,
                  section.key,
                  settings[section.key],
                )
              }
            >
              {LEVELS.map((level) => {
                const selected = settings[section.key] === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={radioOptionLabel(section.label, level.label)}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => handleChange(section.key, level.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
                      selected
                        ? "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30"
                        : "bg-white/5 text-gray-500 border border-white/10 hover:text-gray-300"
                    }`}
                  >
                    <RadioDot active={selected} />
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Desktop: table layout ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Visibility Settings
      </h3>

      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-4">
              Section
            </th>
            {LEVELS.map((level) => (
              <th
                key={level.value}
                className="text-center text-xs font-medium text-gray-500 pb-2 px-4"
              >
                {level.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((section) => (
            <tr
              key={section.key}
              role="radiogroup"
              aria-label={radioGroupLabel(section.label)}
              onKeyDown={(event) =>
                handleRadioKeyDown(
                  event,
                  section.key,
                  settings[section.key],
                )
              }
              className="border-b border-white/5 last:border-0"
            >
              <td className="text-sm text-gray-300 py-3 pr-4">
                {section.label}
              </td>
              {LEVELS.map((level) => {
                const selected = settings[section.key] === level.value;
                return (
                  <td key={level.value} className="text-center py-3 px-4">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={radioOptionLabel(section.label, level.label)}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => handleChange(section.key, level.value)}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
                    >
                      <RadioDot active={selected} large />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Radio Dot ───────────────────────────────────────────────────────────

function RadioDot({ active, large }: { active: boolean; large?: boolean }) {
  const size = large ? "w-5 h-5" : "w-3.5 h-3.5";
  const inner = large ? "w-2.5 h-2.5" : "w-1.5 h-1.5";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full border-2 transition-colors ${size} ${
        active ? "border-plasma-orange" : "border-gray-600"
      }`}
    >
      {active && <span className={`rounded-full bg-plasma-orange ${inner}`} />}
    </span>
  );
}
