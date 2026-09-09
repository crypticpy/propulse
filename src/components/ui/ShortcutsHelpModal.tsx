/**
 * ShortcutsHelpModal Component
 *
 * A standalone help modal that works on every page, with two tabs:
 * keyboard shortcuts (context-aware per route) and the operator quick
 * reference (band plan, Q-codes, prosigns — parity item G12).
 *
 * Triggered by the ? key or from the command palette.
 */

import { lazy, Suspense, useId, useState } from "react";
import { useLocation } from "react-router-dom";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import {
  DEFAULT_SHORTCUTS,
  CATEGORY_LABELS,
  formatShortcut,
  groupShortcutsByCategory,
  type KeyboardShortcut,
  type ShortcutCategory,
} from "@/types/keyboard";

// =============================================================================
// TYPES
// =============================================================================

export interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type HelpTab = "shortcuts" | "reference";

// Reference content stays out of the entry bundle
const ReferencePanel = lazy(() => import("@/components/ui/ReferencePanel"));

// =============================================================================
// STATIC DATA
// =============================================================================

/**
 * Global shortcuts that are always available regardless of route.
 */
const GLOBAL_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "Ctrl+K / Cmd+K", description: "Open command palette" },
  { keys: "?", description: "Show keyboard shortcuts" },
  { keys: "Esc", description: "Close modal / palette" },
];

/**
 * Navigation shortcuts (command-palette driven).
 */
const NAVIGATION_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "Ctrl+K", description: "Quick navigation to any page" },
];

/**
 * Contest-specific shortcuts shown on the /contest route.
 */
const CONTEST_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "Enter", description: "Log QSO / Advance ESM" },
  { keys: "Esc", description: "Wipe input" },
  { keys: "Ctrl+Z", description: "Undo last QSO" },
  { keys: "Ctrl+E", description: "Edit last QSO" },
  { keys: "F1\u2013F12", description: "Macro keys" },
  { keys: "Alt+1\u20139", description: "Band quick-select" },
];

/**
 * Display order for the Map (PropSphere) shortcut categories.
 */
const MAP_CATEGORY_ORDER: ShortcutCategory[] = [
  "view",
  "navigation",
  "target",
  "panels",
  "general",
];

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Renders a single key badge.
 */
function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-xs font-mono font-medium bg-su-line/20 text-su-text border border-su-line/50 rounded">
      {label}
    </kbd>
  );
}

/**
 * Renders a row with key badge(s) on the left and description on the right.
 */
function ShortcutRow({
  keys,
  description,
}: {
  keys: string;
  description: string;
}) {
  // Split composite keys like "Ctrl+K / Cmd+K" into individual badges
  const keyParts = keys.split(" / ");

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-su-line/10 transition-colors">
      <span className="text-sm text-su-muted">{description}</span>
      <span className="flex items-center gap-1.5 ml-4 shrink-0">
        {keyParts.map((part, i) => (
          <span key={part} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-su-muted text-xs">/</span>}
            <KeyBadge label={part} />
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * Renders a category section header.
 */
function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs uppercase tracking-wider text-plasma-orange/80 font-semibold mb-2">
      {title}
    </h3>
  );
}

// =============================================================================
// MAP SHORTCUTS SECTION
// =============================================================================

/**
 * Renders all DEFAULT_SHORTCUTS grouped by category — only shown on /map.
 */
function MapShortcutsSection() {
  const grouped = groupShortcutsByCategory(DEFAULT_SHORTCUTS);

  return (
    <>
      {MAP_CATEGORY_ORDER.map((category) => {
        const shortcuts = grouped.get(category);
        if (!shortcuts || shortcuts.length === 0) {
          return null;
        }

        return (
          <div key={category}>
            <SectionHeader title={`Map \u2014 ${CATEGORY_LABELS[category]}`} />
            <div className="space-y-0.5">
              {shortcuts.map((shortcut: KeyboardShortcut) => (
                <ShortcutRow
                  key={`${shortcut.category}-${shortcut.action}`}
                  keys={formatShortcut(shortcut)}
                  description={shortcut.description}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ShortcutsHelpModal({
  isOpen,
  onClose,
}: ShortcutsHelpModalProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const [tab, setTab] = useState<HelpTab>("shortcuts");

  const isMapPage = pathname === "/map";
  const isContestPage = pathname === "/contest";

  const titleId = useId();
  const descriptionId = useId();

  return (
    <AccessibleDialog
      open={isOpen}
      onClose={onClose}
      title={tab === "shortcuts" ? "Keyboard Shortcuts" : "Quick Reference"}
      chrome="bare"
      labelledBy={titleId}
      describedBy={descriptionId}
      panelProps={{
        className:
          "w-full max-w-[36rem] max-h-[80vh] flex flex-col bg-su-panel/95 backdrop-blur-md border border-su-line/40 rounded-2xl shadow-2xl",
      }}
    >
      <>
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-0">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-su-text flex items-center gap-2"
            >
              <svg
                className="w-5 h-5 text-plasma-orange"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              {tab === "shortcuts" ? "Keyboard Shortcuts" : "Quick Reference"}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-su-muted">
              {tab === "shortcuts"
                ? "Quick access to Propulse features"
                : "Band plan, Q-codes, and CW reference"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-su-muted hover:text-su-text hover:bg-su-line/20 rounded-lg transition-colors"
            aria-label="Close shortcuts help"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tab row */}
        <div className="flex gap-1 px-6 pt-4" role="tablist">
          {(
            [
              ["shortcuts", "Shortcuts"],
              ["reference", "Reference"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                tab === id
                  ? "bg-plasma-orange/15 text-su-text border border-plasma-orange/40 font-semibold"
                  : "text-su-muted border border-transparent hover:bg-su-line/10 hover:text-su-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-5">
          {tab === "reference" && (
            <Suspense
              fallback={
                <p className="text-sm text-su-muted text-center py-8">
                  Loading reference…
                </p>
              }
            >
              <ReferencePanel />
            </Suspense>
          )}

          {tab === "shortcuts" && (
            <>
              {/* Global shortcuts — always shown */}
              <div>
                <SectionHeader title="Global" />
                <div className="space-y-0.5">
                  {GLOBAL_SHORTCUTS.map((s) => (
                    <ShortcutRow
                      key={s.keys}
                      keys={s.keys}
                      description={s.description}
                    />
                  ))}
                </div>
              </div>

              {/* Navigation shortcuts — always shown */}
              <div>
                <SectionHeader title="Navigation" />
                <div className="space-y-0.5">
                  {NAVIGATION_SHORTCUTS.map((s) => (
                    <ShortcutRow
                      key={s.keys}
                      keys={s.keys}
                      description={s.description}
                    />
                  ))}
                </div>
              </div>

              {/* Map shortcuts — only on /map */}
              {isMapPage && <MapShortcutsSection />}

              {/* Contest shortcuts — only on /contest */}
              {isContestPage && (
                <div>
                  <SectionHeader title="Contest" />
                  <div className="space-y-0.5">
                    {CONTEST_SHORTCUTS.map((s) => (
                      <ShortcutRow
                        key={s.keys}
                        keys={s.keys}
                        description={s.description}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <div className="pt-4 border-t border-su-line/40 text-center">
            <p className="text-xs text-su-muted">
              Press{" "}
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-su-line/20 border border-su-line/50 rounded">
                ?
              </kbd>{" "}
              anywhere to toggle this help
            </p>
          </div>
        </div>
      </>
    </AccessibleDialog>
  );
}

ShortcutsHelpModal.displayName = "ShortcutsHelpModal";
