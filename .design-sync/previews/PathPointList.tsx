import { PathPointList, Surface } from "propulse";

const model = {
  name: "ITU-R P.533 ray trace",
  version: "propulse-physics",
  modeledAtMs: Date.now(),
  inputsAsOfMs: Date.now(),
  explanation: "Chapman f0F2 layer profile, Martyn's secant MUF, ITU-R P.533 D-layer absorption.",
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
    explanation: "Transmitter ground point — W1AW, Newington CT.",
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
    explanation: "Hop 1 modeled apex — F2 layer reflection near 295 km.",
    model,
  },
  {
    id: "pt-apex2",
    pathId: "path-w1aw-ja1xyz",
    hopIndex: 1,
    role: "ray-apex" as const,
    coordinates: { lat: 50.2, lon: 90.5 },
    displayHeightKm: 285,
    modeledHeightKm: 270,
    layer: "F2" as const,
    locationPrecision: "modeled" as const,
    explanation: "Hop 2 modeled apex — F2 layer reflection near 270 km.",
    model,
  },
  {
    id: "pt-rx",
    pathId: "path-w1aw-ja1xyz",
    hopIndex: 2,
    role: "ground-point" as const,
    coordinates: { lat: 35.7, lon: 139.7 },
    displayHeightKm: 0,
    modeledHeightKm: null,
    layer: null,
    locationPrecision: "modeled" as const,
    explanation: "Receiver ground point — JA1XYZ, Tokyo.",
    model,
  },
];

export function Selected() {
  return (
    <Surface style={{ width: 300 }}>
      <PathPointList points={points} selectedId="pt-apex1" onSelect={() => {}} />
    </Surface>
  );
}

export function Empty() {
  return (
    <Surface style={{ width: 300 }}>
      <PathPointList points={[]} selectedId={null} onSelect={() => {}} />
    </Surface>
  );
}
