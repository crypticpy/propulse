import { PathPointInspector } from "propulse";

const model = {
  name: "ITU-R P.533 ray trace",
  version: "propulse-physics",
  modeledAtMs: Date.now(),
  inputsAsOfMs: Date.now(),
  explanation: "Chapman f0F2 layer profile, Martyn's secant MUF, ITU-R P.533 D-layer absorption for the W1AW to JA1XYZ path.",
};

const points = [
  {
    id: "pt-tx",
    pathId: "path-w1aw-ja1xyz",
    hopIndex: 0,
    role: "ground-point" as const,
    coordinates: { lat: 41.7, lon: -72.7 },
    displayHeightKm: 0,
    modeledHeightKm: null,
    layer: null,
    locationPrecision: "modeled" as const,
    explanation: "Transmitter ground point — W1AW, Newington CT (FN31).",
    model,
  },
  {
    id: "pt-apex1",
    pathId: "path-w1aw-ja1xyz",
    hopIndex: 0,
    role: "ray-apex" as const,
    coordinates: { lat: 60.1, lon: 10.4 },
    displayHeightKm: 310,
    modeledHeightKm: 295,
    layer: "F2" as const,
    locationPrecision: "modeled" as const,
    explanation: "Hop 1 modeled apex — F2 layer reflection near 295 km. Modeled MUF 24.8 MHz; modeled f0F2 6.1 MHz.",
    model,
  },
  {
    id: "pt-shell1",
    pathId: "path-w1aw-ja1xyz",
    hopIndex: 0,
    role: "shell-highlight" as const,
    coordinates: { lat: 60.1, lon: 10.4 },
    displayHeightKm: 300,
    modeledHeightKm: null,
    layer: "F2" as const,
    locationPrecision: "approximate" as const,
    explanation: "Decorative F2 shell intersection — not an actual reflection height.",
    model,
  },
  {
    id: "pt-rx",
    pathId: "path-w1aw-ja1xyz",
    hopIndex: 1,
    role: "ground-point" as const,
    coordinates: { lat: 35.7, lon: 139.7 },
    displayHeightKm: 0,
    modeledHeightKm: null,
    layer: null,
    locationPrecision: "modeled" as const,
    explanation: "Receiver ground point — JA1XYZ, Tokyo (PM95).",
    model,
  },
];

const pointSet = {
  pathId: "path-w1aw-ja1xyz",
  status: "ready" as const,
  unavailableReason: null,
  points,
};

export function CardOpen() {
  return (
    <div style={{ width: 900, height: 700, position: "relative" }}>
      <PathPointInspector
        pointSet={pointSet}
        selectedId="pt-apex1"
        hoveredId={null}
        open="card"
        anchor={{ x: 460, y: 320 }}
        pathSummary="Modeled single-hop F2 path, 14.074 MHz FT8, short path."
        onSelect={() => {}}
        onClose={() => {}}
        onOpenPathAnalysis={() => {}}
      />
    </div>
  );
}

export function HoverCard() {
  return (
    <div style={{ width: 900, height: 700, position: "relative" }}>
      <PathPointInspector
        pointSet={pointSet}
        selectedId={null}
        hoveredId="pt-apex1"
        open="hover"
        anchor={{ x: 460, y: 320 }}
        onSelect={() => {}}
        onClose={() => {}}
      />
    </div>
  );
}
