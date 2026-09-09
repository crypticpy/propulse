import { MUFLegend, Surface } from "propulse";

export function GlobeOverlay() {
  return (
    <Surface className="inline-block">
      <MUFLegend />
    </Surface>
  );
}

export function InToolbar() {
  return (
    <Surface className="bg-su-panel/90 backdrop-blur-sm inline-block rounded-lg p-2">
      <MUFLegend />
    </Surface>
  );
}
