import { useEffect } from "react";
import { ProfilePopover, Surface } from "propulse";

/**
 * ProfilePopover keeps its open/closed state as internal useState — there
 * is no prop to force it open. Simulate the same click an operator makes
 * on the "Profile" trigger so the built-in profile list is visible.
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
    <Surface style={{ position: "relative", width: 340, height: 420 }}>
      <ProfilePopover activeProfile={null} onSelectProfile={() => {}} />
    </Surface>
  );
}

export function ActiveDxHunter() {
  useEffect(() => {
    openTrigger();
  }, []);
  return (
    <Surface style={{ position: "relative", width: 340, height: 420 }}>
      <ProfilePopover activeProfile="dx-hunter" onSelectProfile={() => {}} />
    </Surface>
  );
}

export function Closed() {
  return (
    <Surface style={{ position: "relative", width: 200, height: 60 }}>
      <ProfilePopover activeProfile="contest" onSelectProfile={() => {}} />
    </Surface>
  );
}
