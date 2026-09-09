import { AlertBanner, Surface } from "propulse";

const critical = {
  id: "alert-geo-critical",
  type: "GEOMAGNETIC_STORM" as const,
  priority: "CRITICAL" as const,
  status: "ACTIVE" as const,
  title: "G3 Geomagnetic Storm Watch",
  message: "Kp reached 7 after a CME arrival; expect HF absorption on polar paths and possible aurora at mid-latitudes.",
  affectedBands: ["160m", "80m", "40m"],
  triggeredAt: "2026-09-08T03:40:00Z",
  expiresAt: "2026-09-08T15:40:00Z",
  source: "K_INDEX" as const,
  thresholdValue: 6,
  currentValue: 7,
};

const warning = {
  id: "alert-rb-warning",
  type: "RADIO_BLACKOUT" as const,
  priority: "WARNING" as const,
  status: "ACTIVE" as const,
  title: "R2 Radio Blackout — X1.2 Flare",
  message: "X1.2 flare caused HF absorption on 20 m and above across the sunlit hemisphere.",
  affectedBands: ["20m", "17m", "15m"],
  triggeredAt: "2026-09-08T18:12:00Z",
  expiresAt: "2026-09-08T20:12:00Z",
  source: "X_RAY_FLUX" as const,
  thresholdValue: 1e-5,
  currentValue: 1.2e-4,
};

const info = {
  id: "alert-band-info",
  type: "BAND_OPENING" as const,
  priority: "INFO" as const,
  status: "ACTIVE" as const,
  title: "20m Band Opening Detected",
  message: "Multi-hop propagation to EU observed on 14.074 MHz FT8.",
  affectedBands: ["20m"],
  triggeredAt: "2026-09-08T13:05:00Z",
  expiresAt: "2026-09-08T14:05:00Z",
  source: "SPOT_DETECTOR" as const,
  thresholdValue: 0,
  currentValue: 1,
};

export function CriticalWithMore() {
  return (
    <Surface style={{ width: 520 }}>
      <AlertBanner
        alerts={[critical, warning, info]}
        onDismiss={() => {}}
        onViewAll={() => {}}
      />
    </Surface>
  );
}

export function WarningSingle() {
  return (
    <Surface style={{ width: 520 }}>
      <AlertBanner alerts={[warning]} onDismiss={() => {}} />
    </Surface>
  );
}
