import type { usePskStationData } from "@/hooks/usePskStation";
import { PskReceptionRows, PskStationControls } from "./PskStationReport";

/** Remote PSK reception evidence stays independent of the local bridge state. */
export function WsjtxHeardReport({ data }: { data: ReturnType<typeof usePskStationData> }) {
  const { feed, rows, state, now } = data;
  return <div className="hcp-report">
    <PskStationControls data={data} direction={false} />
    <p className="hcr-note">{feed.data?.limited ? "ROW LIMIT REACHED · " : ""}PSK reports OF my call · all modes · loaded history may be incomplete.</p>
    <PskReceptionRows rows={rows} direction="of" state={state} now={now} />
  </div>;
}
