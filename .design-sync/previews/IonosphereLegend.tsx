import { IonosphereLegend, Surface } from "propulse";

export function GlobeOverlay() {
  return (
    <Surface className="inline-block">
      <IonosphereLegend />
    </Surface>
  );
}

export function InToolbar() {
  return (
    <Surface className="bg-su-panel/90 backdrop-blur-sm inline-block rounded-lg px-2 py-1">
      <IonosphereLegend className="self-start" />
    </Surface>
  );
}
