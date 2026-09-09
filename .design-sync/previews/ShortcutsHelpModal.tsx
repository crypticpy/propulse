import { useEffect } from "react";
import { ShortcutsHelpModal } from "propulse";

export function Shortcuts() {
  return <ShortcutsHelpModal isOpen onClose={() => {}} />;
}

/**
 * Reference tab isn't reachable via a prop — the tab is internal useState.
 * Simulate the same click the operator would make so the sheet shows the
 * band-plan / Q-code reference content, not just the default Shortcuts tab.
 */
export function Reference() {
  useEffect(() => {
    const tab = document.querySelectorAll('[role="tab"]')[1] as HTMLElement | undefined;
    tab?.click();
  }, []);
  return <ShortcutsHelpModal isOpen onClose={() => {}} />;
}
