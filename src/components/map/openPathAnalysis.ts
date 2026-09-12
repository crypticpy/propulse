/**
 * "Full path analysis" host reveals (#931).
 *
 * `PathPointInspector` hands its action up to whichever view mounted
 * `GlobeView`, and each host has a different Path Analysis surface. Both
 * reveals live here rather than inline in the hosts so they can be exercised
 * without mounting an R3F canvas or a full page — same reason
 * `useFullscreenEscape` was pulled out of `FullscreenPropSphere`.
 */

export interface PropSpherePathRevealOptions {
  /** Lite mode swaps the desktop right column for the Lite dock. */
  isLiteMode: boolean;
  rightPanelMode: "full" | "mini" | "hidden";
  rightPanelLastWidth: number;
  setActiveTab: (tab: "path") => void;
  setRightPanelExpanded: (expanded: boolean) => void;
  setRightPanelWidth: (width: number) => void;
  setRightPanelMode: (mode: "full") => void;
}

/**
 * `PropSphere` owns three Path Analysis surfaces and each one gates itself in
 * CSS or JSX: the bottom tab host is `lg:hidden` (or always mounted in
 * non-lite compact fit), the Lite dock is `hidden lg:flex`, and the desktop
 * right column is `hidden lg:flex` behind `!isLiteMode && !compactFit`.
 *
 * Branching on `window.innerWidth` here revealed exactly one surface and left
 * the others stale, so a click below `lg` in lite mode only expanded the
 * invisible desktop HUD and the visible bottom panel stayed on whatever tab
 * the operator had last picked — and a resize right after the click swapped
 * which surface was mounted anyway. Reveal all of them instead: every set is
 * inert while its surface is unmounted, so whichever one the breakpoint
 * mounts (now or after a resize) is already showing Path.
 */
export function revealPropSpherePathAnalysis({
  isLiteMode,
  rightPanelMode,
  rightPanelLastWidth,
  setActiveTab,
  setRightPanelExpanded,
  setRightPanelWidth,
  setRightPanelMode,
}: PropSpherePathRevealOptions): void {
  setActiveTab("path");
  setRightPanelExpanded(true);
  if (!isLiteMode && rightPanelMode !== "full") {
    setRightPanelWidth(rightPanelLastWidth);
    setRightPanelMode("full");
  }
}

export interface FullscreenPathRevealOptions {
  /** True when the Path Analysis floating panel is docked/collapsed. */
  pathPanelCollapsed: boolean;
  setAmbientMode: (value: boolean) => void;
  toggleProPanelCollapse: (id: string) => void;
  bringToFront: (id: string) => void;
}

/**
 * `FullscreenPropSphere` wraps its whole floating-panel layer in
 * `opacity-0 pointer-events-none` while ambient mode is on, but the ray-path
 * inspector drawn on the globe stays interactive. Uncollapsing and raising
 * Path Analysis without clearing ambient therefore uncollapsed an invisible
 * panel and read as a dead button. An explicit user action beats an ambient
 * display, so leaving ambient is part of the reveal.
 *
 * Observatory mode is deliberately left alone: `exitObservatory` restores the
 * previous layout mode and can drop fullscreen entirely, which is far more
 * than "show me the path". Ambient off with observatory on is already
 * reachable from the ribbon's ambient toggle.
 */
export function revealFullscreenPathAnalysis({
  pathPanelCollapsed,
  setAmbientMode,
  toggleProPanelCollapse,
  bringToFront,
}: FullscreenPathRevealOptions): void {
  setAmbientMode(false);
  if (pathPanelCollapsed) {
    toggleProPanelCollapse("path-analysis");
  }
  bringToFront("path-analysis");
}
