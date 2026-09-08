import { PathPointCard } from "propulse";

const now = Date.now();

export function GroundHop() {
  return (
    <div style={{ width: 320, height: 420 }}>
      <PathPointCard
        point={{
          id: "pt-1",
          pathId: "path-1",
          hopIndex: 1,
          role: "ground-point",
          coordinates: { lat: 44.2, lon: 41.1 },
          displayHeightKm: 0,
          modeledHeightKm: 0,
          layer: null,
          locationPrecision: "modeled",
          explanation:
            "Ground reflection point between JA1XYZ and W1AW on the 20 m short path, modeled from a single F2-layer hop.",
          model: {
            name: "ITU-R P.533",
            version: "2.1",
            modeledAtMs: now - 10 * 60 * 1000,
            inputsAsOfMs: now - 15 * 60 * 1000,
          },
        }}
        status="ready"
        unavailableReason={null}
        onClose={() => {}}
        onOpenPathAnalysis={() => {}}
      />
    </div>
  );
}

export function RayApex() {
  return (
    <div style={{ width: 320, height: 420 }}>
      <PathPointCard
        point={{
          id: "pt-2",
          pathId: "path-1",
          hopIndex: 0,
          role: "ray-apex",
          coordinates: { lat: 38.5, lon: 160.2 },
          displayHeightKm: 340,
          modeledHeightKm: 310,
          layer: "F2",
          locationPrecision: "modeled",
          explanation:
            "Modeled apex of the first hop through the F2 layer at 14.074 MHz, SFI 142, Kp 3.",
          model: {
            name: "ITU-R P.533",
            version: "2.1",
            modeledAtMs: now - 5 * 60 * 1000,
            inputsAsOfMs: now - 8 * 60 * 1000,
          },
        }}
        status="ready"
        unavailableReason={null}
        pathSummary="20 m short path, JA1XYZ to W1AW"
        onClose={() => {}}
        onOpenPathAnalysis={() => {}}
      />
    </div>
  );
}

export function ModelUnavailable() {
  return (
    <div style={{ width: 320, height: 420 }}>
      <PathPointCard
        point={null}
        status="model-unavailable"
        unavailableReason="Propagation model data is temporarily unavailable for this path."
        onClose={() => {}}
      />
    </div>
  );
}
