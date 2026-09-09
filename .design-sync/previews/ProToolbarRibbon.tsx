import { ProToolbarRibbon } from "propulse";

const baseProps = {
  ambientMode: false,
  showTopBar: true,
  observatoryMode: false,
  onToggleAmbient: () => {},
  onExit: () => {},
  onResetLayout: () => {},
  onOpenPresetManager: () => {},
};

// All content-shaping state (proRibbonExpanded, viewMode, activePreset,
// layout mode) lives in useMapStore, which defaults to expanded/globe/no
// preset — a realistic Pro-mode ribbon renders with no extra setup. The
// ribbon measures window width itself (isCompact <1600px, isNarrow
// <1200px), so at this component's default capture viewport it renders its
// real compact/narrow branch, not the full wide desktop layout — see
// learnings for the requested viewport override.
export function Expanded() {
  return (
    <div style={{ width: "100%", height: 260, position: "relative" }}>
      <ProToolbarRibbon {...baseProps} />
    </div>
  );
}

// proRibbonExpanded is a persisted useMapStore boolean — clicking its
// collapse chevron would mutate localStorage across the rest of this
// capture run, so we differentiate the second cell with controlled props
// instead: observatory mode hides the ambient toggle, ambient mode
// highlights it.
export function Observatory() {
  return (
    <div style={{ width: "100%", height: 260, position: "relative" }}>
      <ProToolbarRibbon {...baseProps} ambientMode observatoryMode />
    </div>
  );
}
