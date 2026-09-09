import { RecommendationsBadge } from "propulse";

export function LongPath() {
  return (
    <div style={{ width: 420, height: 72 }}>
      <RecommendationsBadge
        homeLat={32.5}
        homeLon={-86.0}
        targetLat={35.68}
        targetLon={139.65}
        displayTime={new Date()}
        className="h-full"
      />
    </div>
  );
}

export function RegionalPath() {
  return (
    <div style={{ width: 420, height: 72 }}>
      <RecommendationsBadge
        homeLat={51.5}
        homeLon={7.0}
        targetLat={45.46}
        targetLon={9.19}
        displayTime={new Date(Date.UTC(2026, 0, 15, 3, 0, 0))}
        className="h-full"
      />
    </div>
  );
}
