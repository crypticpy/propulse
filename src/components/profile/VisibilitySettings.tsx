/**
 * VisibilitySettings — Per-section privacy controls for the Social tab.
 *
 * Renders a matrix: 5 profile sections x 3 visibility levels.
 * Persists to profileStore via visibilitySettings field.
 *
 * Every choice is a native `<input type="radio">` sharing one `name` per
 * section. Native radios already are a group: they expose position and count,
 * they roam with the arrow keys, and only the checked one is a tab stop —
 * without a `role="radiogroup"` element having to contain them, which on the
 * desktop table would mean reparenting them out of their cells.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  anyDialogOpen,
  subscribeToDialogStack,
} from "@/components/ui/AccessibleDialog";
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

function radioKey(section: SectionKey, level: VisibilityLevel): string {
  return `${section}:${level}`;
}

// ── Component ───────────────────────────────────────────────────────────

export function VisibilitySettings() {
  const isMobile = useIsMobile();
  const settings = useProfileStore((s) => s.visibilitySettings);
  const setVisibilitySettings = useProfileStore((s) => s.setVisibilitySettings);
  const requireAuth = useRequireAuth();
  const idBase = useId();

  const radioRefs = useRef(new Map<string, HTMLInputElement>());
  /**
   * A choice made while signed out is committed after the sign-in modal
   * closes. Focusing then would fight the dialog's own restore, which runs on
   * teardown and puts focus back on the control that opened it — the one that
   * is no longer the checked radio. So the target is parked here and applied
   * once the dialog stack reports nothing open.
   */
  const pendingFocusRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(
    () => subscribeToDialogStack(() => setDialogOpen(anyDialogOpen())),
    [],
  );

  useEffect(() => {
    if (dialogOpen) return;
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    radioRefs.current.get(pending)?.focus();
  }, [dialogOpen, settings]);

  const handleChange = useCallback(
    (section: SectionKey, level: VisibilityLevel) => {
      requireAuth(() => {
        setVisibilitySettings({ [section]: level });
        // Direct path: the browser already focused the radio that was
        // clicked or arrowed onto. Deferred path: the modal is still up, so
        // park the target and let the teardown effect place focus.
        if (anyDialogOpen()) {
          pendingFocusRef.current = radioKey(section, level);
        }
      }, "Sign in to manage profile visibility");
    },
    [setVisibilitySettings, requireAuth],
  );

  const registerRadio = useCallback(
    (section: SectionKey, level: VisibilityLevel) =>
      (element: HTMLInputElement | null) => {
        const key = radioKey(section, level);
        if (element) radioRefs.current.set(key, element);
        else radioRefs.current.delete(key);
      },
    [],
  );

  const groupName = (section: SectionKey) => `${idBase}-${section}`;

  // ── Mobile: stacked cards ───────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-su-muted uppercase tracking-wider">
          Visibility Settings
        </h3>

        {SECTIONS.map((section) => (
          <div
            key={section.key}
            className="bg-panel/30 border border-su-line/20 rounded-lg p-3 space-y-2"
          >
            <span className="text-sm font-medium text-su-muted">
              {section.label}
            </span>
            {/*
              No row header to name the section here, so the group carries the
              name. The native radios inside it are the group's members either
              way — they are siblings in this branch, so nothing is reparented.
            */}
            <div
              role="radiogroup"
              aria-label={radioGroupLabel(section.label)}
              className="flex gap-2"
            >
              {LEVELS.map((level) => {
                const selected = settings[section.key] === level.value;
                return (
                  <label
                    key={level.value}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-plasma-orange/50 ${
                      selected
                        ? "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30"
                        : "bg-su-line/10 text-su-muted border border-su-line/40 hover:text-su-text"
                    }`}
                  >
                    <input
                      ref={registerRadio(section.key, level.value)}
                      type="radio"
                      name={groupName(section.key)}
                      value={level.value}
                      checked={selected}
                      onChange={() => handleChange(section.key, level.value)}
                      className="sr-only"
                    />
                    <RadioDot active={selected} />
                    {level.label}
                  </label>
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
      <h3 className="text-sm font-semibold text-su-muted uppercase tracking-wider">
        Visibility Settings
      </h3>

      <table className="w-full">
        <thead>
          <tr className="border-b border-su-line/20">
            <th
              scope="col"
              className="text-left text-xs font-medium text-su-muted pb-2 pr-4"
            >
              Section
            </th>
            {LEVELS.map((level) => (
              <th
                key={level.value}
                scope="col"
                className="text-center text-xs font-medium text-su-muted pb-2 px-4"
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
              className="border-b border-su-line/20 last:border-0"
            >
              {/*
                The row keeps its native role, the cells keep their headers,
                and the three choices are one group because they share a radio
                `name` — no element has to contain them, so nothing is
                reparented out of its cell. `<th scope="row">` names the
                section, `<th scope="col">` names the level.
              */}
              <th
                scope="row"
                className="text-left text-sm font-normal text-su-muted py-3 pr-4"
              >
                {section.label}
              </th>
              {LEVELS.map((level) => {
                const selected = settings[section.key] === level.value;
                return (
                  <td key={level.value} className="text-center py-3 px-4">
                    {/* The label is the hit target, at the size the button
                        was, so the control does not shrink to a native dot. */}
                    <label className="inline-flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-colors hover:bg-su-line/10 focus-within:ring-2 focus-within:ring-plasma-orange/50">
                      <input
                        ref={registerRadio(section.key, level.value)}
                        type="radio"
                        name={groupName(section.key)}
                        value={level.value}
                        checked={selected}
                        onChange={() => handleChange(section.key, level.value)}
                        className="sr-only"
                      />
                      <span className="sr-only">{level.label}</span>
                      <RadioDot active={selected} large />
                    </label>
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
        active ? "border-plasma-orange" : "border-su-line"
      }`}
    >
      {active && <span className={`rounded-full bg-plasma-orange ${inner}`} />}
    </span>
  );
}
