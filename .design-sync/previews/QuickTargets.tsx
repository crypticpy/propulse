import { QuickTargets } from "propulse";

// savedTargets always comes from useUserStore with no prop to seed it, so
// the empty state below is the only state reachable without hacking stores.
export function Empty() {
  return (
    <div style={{ width: 340 }}>
      <QuickTargets />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 240 }}>
      <QuickTargets />
    </div>
  );
}
