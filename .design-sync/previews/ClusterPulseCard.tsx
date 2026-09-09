import { ClusterPulseCard } from "propulse";

// className/onClick only — spot metrics come from useDXStore. With no spots
// loaded in this sandbox it renders its own honest "Waiting for spots..."
// state (the same branch the app shows before the first cluster spot lands).
export function Default() {
  return (
    <div style={{ width: 320 }}>
      <ClusterPulseCard />
    </div>
  );
}

export function Clickable() {
  return (
    <div style={{ width: 320 }}>
      <ClusterPulseCard onClick={() => {}} />
    </div>
  );
}
