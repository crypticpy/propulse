import { HistoryCard } from "propulse";

// className/onClick only — "this day in history" entries come from
// useLogbook. With no logbook in this sandbox it renders its own honest
// empty state pointing the operator at the Logbook page.
export function Empty() {
  return (
    <div style={{ width: 320 }}>
      <HistoryCard />
    </div>
  );
}

export function Clickable() {
  return (
    <div style={{ width: 320 }}>
      <HistoryCard onClick={() => {}} />
    </div>
  );
}
