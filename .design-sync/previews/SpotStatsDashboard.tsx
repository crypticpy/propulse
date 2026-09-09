import { SpotStatsDashboard } from "propulse";

// className/compact/onClick only — stats derive from useDXStore.spots.
// With no spots loaded in this sandbox it renders its real empty branch
// ("No spots to analyze"), taken before the compact/full split.
export function Full() {
  return (
    <div style={{ width: 420 }}>
      <SpotStatsDashboard />
    </div>
  );
}

export function Compact() {
  return (
    <div style={{ width: 320 }}>
      <SpotStatsDashboard compact onClick={() => {}} />
    </div>
  );
}
