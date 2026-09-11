import { create } from "zustand";

/**
 * Session state for the chrome in a map view's bottom-left corner column.
 *
 * The column lives inside the projection view (#930 round 7: one owner per
 * corner) and a host switches projection by mounting a different component,
 * so anything the column holds in `useState` is destroyed every time the
 * operator switches globe/flat/azimuthal. The two booleans the operator sets
 * by hand therefore live outside the view tree.
 *
 * Deliberately not persisted (a session's working state, not a preference to
 * restore months later) and deliberately not keyed by host: it is one
 * operator's chrome, the same on PropSphere, HamClock and AtmosPulse.
 */
interface MapChromeUiState {
  /** `LayerLegend`'s header toggle. */
  legendCollapsed: boolean;
  /** `MapSizeSliders`' collapsed-icon vs expanded-panel state. */
  sizePanelExpanded: boolean;
  setLegendCollapsed: (collapsed: boolean) => void;
  setSizePanelExpanded: (expanded: boolean) => void;
}

export const useMapChromeUiStore = create<MapChromeUiState>()((set) => ({
  legendCollapsed: false,
  sizePanelExpanded: false,
  setLegendCollapsed: (legendCollapsed) => set({ legendCollapsed }),
  setSizePanelExpanded: (sizePanelExpanded) => set({ sizePanelExpanded }),
}));
