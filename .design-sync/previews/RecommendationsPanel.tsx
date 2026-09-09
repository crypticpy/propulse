import { RecommendationsPanel } from "propulse";

export function DaytimePath() {
  return (
    <div style={{ width: 340 }}>
      <RecommendationsPanel
        homeLat={32.5}
        homeLon={-86.0}
        targetLat={35.68}
        targetLon={139.65}
        displayTime={new Date(Date.UTC(2026, 0, 15, 14, 0, 0))}
      />
    </div>
  );
}

export function NightPath() {
  return (
    <div style={{ width: 340 }}>
      <RecommendationsPanel
        homeLat={51.5}
        homeLon={7.0}
        targetLat={-33.87}
        targetLon={151.21}
        displayTime={new Date(Date.UTC(2026, 0, 15, 22, 0, 0))}
      />
    </div>
  );
}
