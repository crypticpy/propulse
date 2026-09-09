import { useEffect } from "react";
import { LayersPopover, Surface } from "propulse";

/**
 * LayersPopover keeps open/active-category state as internal useState with
 * no prop to force it — clicking the trigger opens it AND selects the
 * first category by default, so a single simulated click is enough to show
 * the cascading two-tier menu (category column + submenu panel).
 *
 * The panel is portal-rendered with position:fixed relative to the
 * viewport, anchored under the trigger button — see learnings for a
 * possible cardMode override if it escapes the card bounds.
 */
function openTrigger() {
  const trigger = document.querySelector(
    'button[aria-label^="Map layers"]',
  ) as HTMLElement | null;
  trigger?.click();
}

export function Open() {
  useEffect(() => {
    openTrigger();
  }, []);
  return (
    <Surface style={{ position: "relative", width: 460, height: 420, paddingTop: 40 }}>
      <LayersPopover />
    </Surface>
  );
}

export function CompactOpen() {
  useEffect(() => {
    openTrigger();
  }, []);
  return (
    <Surface style={{ position: "relative", width: 460, height: 420, paddingTop: 40 }}>
      <LayersPopover compact />
    </Surface>
  );
}
