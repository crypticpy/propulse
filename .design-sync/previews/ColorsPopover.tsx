import { useEffect } from "react";
import { ColorsPopover, Surface } from "propulse";

/**
 * ColorsPopover keeps its open/closed state as internal useState — there is
 * no prop to force it open. Simulate the same click an operator makes on
 * the "Colors" trigger so the mode legend and swatches are visible inside
 * the card instead of the collapsed trigger-only default.
 */
function openTrigger() {
  const trigger = document.querySelector(
    'button[aria-haspopup="true"]',
  ) as HTMLElement | null;
  trigger?.click();
}

export function Open() {
  useEffect(() => {
    openTrigger();
  }, []);
  return (
    <Surface style={{ position: "relative", width: 320, height: 340 }}>
      <ColorsPopover />
    </Surface>
  );
}

export function Closed() {
  return (
    <Surface style={{ position: "relative", width: 200, height: 60 }}>
      <ColorsPopover />
    </Surface>
  );
}
