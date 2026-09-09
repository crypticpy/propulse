import { useEffect } from "react";
import { ReferencePanel, Surface } from "propulse";

export function Default() {
  return (
    <Surface>
      <ReferencePanel />
    </Surface>
  );
}

/**
 * The filter box is internal useState with no prop to seed it. Simulate
 * typing through the input's own native setter (front-door, not a store
 * hack) so the filtered Q-code/prosign/abbreviation state renders.
 */
export function Filtered() {
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter reference tables"]',
    );
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "cq");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);
  return (
    <Surface>
      <ReferencePanel />
    </Surface>
  );
}
