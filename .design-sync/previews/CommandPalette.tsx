import { useEffect } from "react";
import { CommandPalette } from "propulse";

export function Default() {
  return (
    <CommandPalette
      isOpen
      onClose={() => {}}
      onShowShortcuts={() => {}}
      onRefreshData={() => {}}
      onOpenSettings={() => {}}
    />
  );
}

/**
 * The query box is an internal useState with no prop to seed it. Simulate
 * the operator typing "solar" through the input's own native setter so the
 * filtered results list (the palette's most common real-world state) shows.
 */
export function Filtered() {
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Type a command..."]',
    );
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "solar");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);
  return <CommandPalette isOpen onClose={() => {}} />;
}
