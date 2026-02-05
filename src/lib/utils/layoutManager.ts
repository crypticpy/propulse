/**
 * Layout Manager (QoL11)
 *
 * Manages panel layout state, presets, and persistence.
 * Panels can be reordered, collapsed, and sized.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelLayout {
  id: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
  width?: number;
  height?: number;
}

export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  panels: PanelLayout[];
}

export interface DashboardLayout {
  /** Active preset name or "custom" */
  activePreset: string;
  /** Panel configurations */
  panels: PanelLayout[];
}

// ---------------------------------------------------------------------------
// Panel IDs
// ---------------------------------------------------------------------------

export const PANEL_IDS = {
  BAND_CONDITIONS: "band-conditions",
  PATH_ANALYSIS: "path-analysis",
  DX_CONSOLE: "dx-console",
  DX_SPOT_LIST: "dx-spot-list",
  WSJTX_STATUS: "wsjtx-status",
  FORECAST: "forecast",
  BAND_SCOPE: "band-scope",
  MODEL_ACCURACY: "model-accuracy",
  SKED_SCHEDULER: "sked-scheduler",
} as const;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "dx-hunter",
    name: "DX Hunter",
    description: "Focus on DX spots and propagation paths",
    panels: [
      {
        id: PANEL_IDS.BAND_CONDITIONS,
        visible: true,
        collapsed: false,
        order: 0,
      },
      {
        id: PANEL_IDS.PATH_ANALYSIS,
        visible: true,
        collapsed: false,
        order: 1,
      },
      { id: PANEL_IDS.DX_CONSOLE, visible: true, collapsed: false, order: 2 },
      { id: PANEL_IDS.DX_SPOT_LIST, visible: true, collapsed: false, order: 3 },
      { id: PANEL_IDS.FORECAST, visible: true, collapsed: false, order: 4 },
      {
        id: PANEL_IDS.WSJTX_STATUS,
        visible: false,
        collapsed: false,
        order: 5,
      },
      { id: PANEL_IDS.BAND_SCOPE, visible: false, collapsed: false, order: 6 },
      {
        id: PANEL_IDS.MODEL_ACCURACY,
        visible: false,
        collapsed: true,
        order: 7,
      },
      {
        id: PANEL_IDS.SKED_SCHEDULER,
        visible: true,
        collapsed: false,
        order: 8,
      },
    ],
  },
  {
    id: "contest",
    name: "Contest",
    description: "Optimized for contest operation rate",
    panels: [
      {
        id: PANEL_IDS.BAND_CONDITIONS,
        visible: true,
        collapsed: true,
        order: 0,
      },
      {
        id: PANEL_IDS.PATH_ANALYSIS,
        visible: false,
        collapsed: false,
        order: 1,
      },
      { id: PANEL_IDS.DX_CONSOLE, visible: true, collapsed: false, order: 2 },
      { id: PANEL_IDS.DX_SPOT_LIST, visible: true, collapsed: false, order: 3 },
      { id: PANEL_IDS.FORECAST, visible: false, collapsed: false, order: 4 },
      {
        id: PANEL_IDS.WSJTX_STATUS,
        visible: false,
        collapsed: false,
        order: 5,
      },
      { id: PANEL_IDS.BAND_SCOPE, visible: false, collapsed: false, order: 6 },
      {
        id: PANEL_IDS.MODEL_ACCURACY,
        visible: false,
        collapsed: false,
        order: 7,
      },
      {
        id: PANEL_IDS.SKED_SCHEDULER,
        visible: false,
        collapsed: false,
        order: 8,
      },
    ],
  },
  {
    id: "propagation",
    name: "Propagation Researcher",
    description: "Deep dive into propagation conditions",
    panels: [
      {
        id: PANEL_IDS.BAND_CONDITIONS,
        visible: true,
        collapsed: false,
        order: 0,
      },
      {
        id: PANEL_IDS.PATH_ANALYSIS,
        visible: true,
        collapsed: false,
        order: 1,
      },
      { id: PANEL_IDS.DX_CONSOLE, visible: false, collapsed: false, order: 2 },
      { id: PANEL_IDS.DX_SPOT_LIST, visible: true, collapsed: false, order: 3 },
      { id: PANEL_IDS.FORECAST, visible: true, collapsed: false, order: 4 },
      { id: PANEL_IDS.WSJTX_STATUS, visible: true, collapsed: false, order: 5 },
      { id: PANEL_IDS.BAND_SCOPE, visible: true, collapsed: false, order: 6 },
      {
        id: PANEL_IDS.MODEL_ACCURACY,
        visible: true,
        collapsed: false,
        order: 7,
      },
      {
        id: PANEL_IDS.SKED_SCHEDULER,
        visible: false,
        collapsed: false,
        order: 8,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Default layout
// ---------------------------------------------------------------------------

export const DEFAULT_LAYOUT: DashboardLayout = {
  activePreset: "dx-hunter",
  panels: LAYOUT_PRESETS[0].panels,
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "propulse-layout";

export function loadLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    return JSON.parse(raw) as DashboardLayout;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage full or unavailable
  }
}

// ---------------------------------------------------------------------------
// Layout operations
// ---------------------------------------------------------------------------

export function applyPreset(presetId: string): DashboardLayout {
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return DEFAULT_LAYOUT;
  const layout: DashboardLayout = {
    activePreset: presetId,
    panels: [...preset.panels],
  };
  saveLayout(layout);
  return layout;
}

export function togglePanelVisibility(
  layout: DashboardLayout,
  panelId: string,
): DashboardLayout {
  const updated: DashboardLayout = {
    activePreset: "custom",
    panels: layout.panels.map((p) =>
      p.id === panelId ? { ...p, visible: !p.visible } : p,
    ),
  };
  saveLayout(updated);
  return updated;
}

export function togglePanelCollapse(
  layout: DashboardLayout,
  panelId: string,
): DashboardLayout {
  const updated: DashboardLayout = {
    activePreset: "custom",
    panels: layout.panels.map((p) =>
      p.id === panelId ? { ...p, collapsed: !p.collapsed } : p,
    ),
  };
  saveLayout(updated);
  return updated;
}

export function reorderPanels(
  layout: DashboardLayout,
  panelId: string,
  newOrder: number,
): DashboardLayout {
  const sorted = [...layout.panels].sort((a, b) => a.order - b.order);
  const currentIdx = sorted.findIndex((p) => p.id === panelId);
  if (currentIdx === -1) return layout;

  const [moved] = sorted.splice(currentIdx, 1);
  sorted.splice(newOrder, 0, moved);

  const updated: DashboardLayout = {
    activePreset: "custom",
    panels: sorted.map((p, i) => ({ ...p, order: i })),
  };
  saveLayout(updated);
  return updated;
}

export function getPanelConfig(
  layout: DashboardLayout,
  panelId: string,
): PanelLayout | undefined {
  return layout.panels.find((p) => p.id === panelId);
}

export function getVisiblePanels(layout: DashboardLayout): PanelLayout[] {
  return layout.panels
    .filter((p) => p.visible)
    .sort((a, b) => a.order - b.order);
}
