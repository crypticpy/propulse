import { useState } from "react";
import { usePskStationData } from "@/hooks/usePskStation";
import { HamClockTile } from "../HamClockTile";
import { PskStationReport, PskReceptionRows } from "../reports/PskStationReport";

export function PskStationTile() {
  const [open, setOpen] = useState(false);
  const { feed, view, rows, state, now } = usePskStationData();
  return <>
    <HamClockTile grow title="PSK Reporter" source={state} state={state === "UPDATED" ? "var(--hc-accent)" : "var(--hc-warn)"} onOpen={() => setOpen(true)} openLabel="Open the PSK Reporter report">
      <p className="hcr-note">{view.direction === "of" ? "OF" : "BY"} {feed.callsign ?? "MY CALL"} · {view.minutes} MIN · {view.band === "all" ? "ALL BANDS" : view.band.toUpperCase()}</p>
      <PskReceptionRows rows={rows} direction={view.direction} state={state} now={now} compact />
    </HamClockTile>
    {open && <PskStationReport open onClose={() => setOpen(false)} />}
  </>;
}
