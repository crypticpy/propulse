import { useEffect } from "react";
import { BasemapCategory, Surface } from "propulse";

/**
 * BasemapCategory reads mapStyle/displayQuality/nightDarkness from real
 * app stores and exposes no props — it always renders the store's default
 * selection (Satellite basemap, default image quality). That default is a
 * faithful, honest state: this is exactly what a first-time operator sees
 * opening Layers -> Basemap.
 */
export function Default() {
  return (
    <Surface style={{ width: 260 }}>
      <BasemapCategory />
    </Surface>
  );
}

/**
 * "Standard" isn't reachable via a prop — the selection is internal
 * useState in mapStore. Simulate the same click an operator would make on
 * the Standard basemap card so the ring/active styling shows on the second
 * option instead of only ever seeing the default Satellite selection.
 */
export function StandardSelected() {
  useEffect(() => {
    const buttons = document.querySelectorAll("button");
    for (const button of buttons) {
      if (button.textContent?.includes("Standard")) {
        button.click();
        break;
      }
    }
  }, []);
  return (
    <Surface style={{ width: 260 }}>
      <BasemapCategory />
    </Surface>
  );
}
