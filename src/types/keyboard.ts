/**
 * Keyboard Shortcuts Type Definitions
 *
 * Types and constants for the PropSphere keyboard navigation system.
 * Provides consistent shortcut definitions across the application.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Modifier keys that can be combined with shortcuts
 */
export type KeyModifier = "ctrl" | "alt" | "shift" | "meta";

/**
 * Categories for organizing shortcuts in the help overlay
 */
export type ShortcutCategory =
  | "navigation"
  | "view"
  | "target"
  | "panels"
  | "general";

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  /** The key to press (e.g., 'g', 'Escape', '1') */
  key: string;
  /** Optional modifier keys required */
  modifiers?: KeyModifier[];
  /** Action identifier for the callback */
  action: string;
  /** Human-readable description for the help overlay */
  description: string;
  /** Category for grouping in help overlay */
  category: ShortcutCategory;
}

// =============================================================================
// SHORTCUT CATEGORY LABELS
// =============================================================================

/**
 * Display labels for shortcut categories
 */
export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: "Navigation",
  view: "View Modes",
  target: "Target Actions",
  panels: "Panels",
  general: "General",
};

// =============================================================================
// DEFAULT SHORTCUTS
// =============================================================================

/**
 * Default keyboard shortcuts for PropSphere
 */
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  {
    key: "g",
    action: "openGridInput",
    description: "Open grid input",
    category: "navigation",
  },
  {
    key: "s",
    action: "togglePathMode",
    description: "Cycle short / long / both path",
    category: "navigation",
  },

  // View modes
  {
    key: "1",
    action: "viewGlobe",
    description: "3D Globe view",
    category: "view",
  },
  {
    key: "2",
    action: "viewFlat",
    description: "2D Map view",
    category: "view",
  },
  {
    key: "3",
    action: "viewAzimuthal",
    description: "Azimuthal view",
    category: "view",
  },
  {
    key: "l",
    action: "toggleLiteMode",
    description: "Toggle Lite Mode",
    category: "view",
  },

  // Target actions
  {
    key: "t",
    action: "setHoveredAsTarget",
    description: "Set hovered as target",
    category: "target",
  },
  {
    key: "w",
    action: "toggleWatch",
    description: "Toggle watch",
    category: "target",
  },
  {
    key: "p",
    action: "addPin",
    description: "Add pin at target",
    category: "target",
  },

  // Panels
  {
    key: "r",
    action: "openGridResearch",
    description: "Research grid",
    category: "panels",
  },

  // General
  {
    key: "Escape",
    action: "clearAndClose",
    description: "Clear and close",
    category: "general",
  },
  {
    key: "?",
    action: "showHelp",
    description: "Show shortcuts",
    category: "general",
  },
  {
    key: "F1",
    action: "showHelp",
    description: "Show shortcuts",
    category: "general",
  },
  {
    key: " ",
    action: "toggleTimeMachine",
    description: "Toggle time machine",
    category: "general",
  },

  // Band/Mode cycling
  {
    key: "b",
    action: "cycleBand",
    description: "Cycle active band",
    category: "general",
  },
  {
    key: "m",
    action: "cycleMode",
    description: "Cycle active mode",
    category: "general",
  },
  {
    key: "b",
    modifiers: ["shift"],
    action: "cycleBandReverse",
    description: "Cycle band (reverse)",
    category: "general",
  },

  // Onboarding tour
  {
    key: "h",
    modifiers: ["shift"],
    action: "startTour",
    description: "Start guided tour",
    category: "general",
  },

  // Undo/Redo
  {
    key: "z",
    modifiers: ["ctrl"],
    action: "undo",
    description: "Undo last action",
    category: "general",
  },
  {
    key: "z",
    modifiers: ["ctrl", "shift"],
    action: "redo",
    description: "Redo last undone action",
    category: "general",
  },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format a shortcut for display (e.g., "Ctrl + G")
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.modifiers) {
    if (shortcut.modifiers.includes("ctrl")) {
      parts.push("Ctrl");
    }
    if (shortcut.modifiers.includes("alt")) {
      parts.push("Alt");
    }
    if (shortcut.modifiers.includes("shift")) {
      parts.push("Shift");
    }
    if (shortcut.modifiers.includes("meta")) {
      parts.push("Cmd");
    }
  }

  // Format special keys for display
  let keyDisplay = shortcut.key;
  switch (shortcut.key) {
    case " ":
      keyDisplay = "Space";
      break;
    case "Escape":
      keyDisplay = "Esc";
      break;
    default:
      // Capitalize single letters
      if (keyDisplay.length === 1) {
        keyDisplay = keyDisplay.toUpperCase();
      }
  }

  parts.push(keyDisplay);
  return parts.join(" + ");
}

/**
 * Group shortcuts by category for display
 */
export function groupShortcutsByCategory(
  shortcuts: KeyboardShortcut[],
): Map<ShortcutCategory, KeyboardShortcut[]> {
  const groups = new Map<ShortcutCategory, KeyboardShortcut[]>();

  for (const shortcut of shortcuts) {
    const existing = groups.get(shortcut.category) || [];
    existing.push(shortcut);
    groups.set(shortcut.category, existing);
  }

  return groups;
}
