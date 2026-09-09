import { LogStatsCard } from "propulse";

// Stats (today/week/month/DXCC/total + 7-day bars) come from useLogbook,
// which has no entries in this sandbox — the honest zeroed state, same
// shape the app shows for a brand-new logbook.
export function Default() {
  return (
    <div style={{ width: 320 }}>
      <LogStatsCard />
    </div>
  );
}

export function AutoRefresh() {
  return (
    <div style={{ width: 320 }}>
      <LogStatsCard autoRefresh onToggleAutoRefresh={() => {}} onClick={() => {}} />
    </div>
  );
}
