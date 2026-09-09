import { StormImpactPanel, Surface } from "propulse";

const geomagneticStorm = {
  id: "alert-geo-003",
  type: "GEOMAGNETIC_STORM" as const,
  priority: "WARNING" as const,
  status: "ACTIVE" as const,
  title: "G3 Geomagnetic Storm Watch",
  message: "Planetary Kp index reached 7 following a CME arrival at 03:40 UTC.",
  affectedBands: ["160m", "80m", "40m"],
  triggeredAt: "2026-09-08T03:40:00Z",
  expiresAt: "2026-09-08T15:40:00Z",
  source: "K_INDEX" as const,
  thresholdValue: 6,
  currentValue: 7,
};

const radioBlackout = {
  id: "alert-rb-004",
  type: "RADIO_BLACKOUT" as const,
  priority: "CRITICAL" as const,
  status: "ACTIVE" as const,
  title: "R2 Radio Blackout — X1.2 Flare",
  message: "X1.2 flare peaked at 18:12 UTC, causing HF absorption on the sunlit hemisphere.",
  affectedBands: ["20m", "17m", "15m", "12m", "10m"],
  triggeredAt: "2026-09-08T18:12:00Z",
  expiresAt: "2026-09-08T20:12:00Z",
  source: "X_RAY_FLUX" as const,
  thresholdValue: 1e-4,
  currentValue: 1.2e-4,
};

export function GeomagneticStorm() {
  return (
    <Surface style={{ width: 420 }}>
      <StormImpactPanel alert={geomagneticStorm} />
    </Surface>
  );
}

export function RadioBlackout() {
  return (
    <Surface style={{ width: 420 }}>
      <StormImpactPanel alert={radioBlackout} />
    </Surface>
  );
}
