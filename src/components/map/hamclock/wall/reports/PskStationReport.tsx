import { usePskStationData } from "@/hooks/usePskStation";
import { PSK_WINDOWS, type PskDirection, type PskStationReport as Reception, type PskWindowMinutes } from "@/lib/hamclock/pskStation";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { activationAge } from "@/lib/hamclock/activations";
import { TuneButton } from "@/components/radio/TuneButton";
import { HamClockSegmented } from "../controls";
import { useVisibleRows } from "../useVisibleRows";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";

export function PskStationReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = usePskStationData(open);
  const { feed, view, rows, state, now } = data;
  const { footer, updated } = reportFooter(`PSK REPORTER · ${state} · RETRIEVED`, feed.data?.fetchedAt ?? null, now);
  const counterpart = (r: Reception) => view.direction === "of" ? r.receiverCallsign : r.senderCallsign;
  return <WallReport open={open} onClose={onClose} title={`PSK Reporter · ${feed.callsign ?? "station call required"}`}
    hero={feed.data?.fetchedAt == null ? "—" : rows.length} verdict={view.direction === "of" ? "HEARING ME" : "HEARD BY ME"}
    tone={state === "UPDATED" ? "accent" : "warn"} facts={[
      { label: "LOADED REPORTS", value: feed.data?.fetchedAt == null ? "—" : rows.length },
      { label: "OTHER STATIONS", value: feed.data?.fetchedAt == null ? "—" : new Set(rows.map(counterpart)).size },
      { label: "WINDOW", value: `${view.minutes} MIN` },
      { label: "BAND", value: view.band === "all" ? "ALL" : view.band.toUpperCase() },
      { label: "SOURCE", value: state },
      { label: "NEWEST", value: rows[0] ? activationAge(new Date(rows[0].observedAt).toISOString(), now) : "—" },
    ]} footer={footer} updated={updated} pinId="psk-station" pinElement={<PskStationReport open onClose={onClose} />}>
    <div className="hcp-report">
      <PskStationControls data={data} />
      <p className="hcr-note">{feed.data?.limited ? "ROW LIMIT REACHED · " : ""}Loaded reports only · history may be incomplete · refresh 5 min.</p>
      <PskReceptionRows rows={rows} direction={view.direction} state={state} now={now} />
    </div>
  </WallReport>;
}

export function PskStationControls({ data, direction = true }: { data: ReturnType<typeof usePskStationData>; direction?: boolean }) {
  const { feed, view } = data;
  const bands = [...new Set([...(feed.data?.reports ?? [])].sort((a, b) => a.frequencyHz - b.frequencyHz).map(r => bandFromFreq(r.frequencyHz / 1000)).filter((b): b is string => b !== null))];
  if (view.band !== "all" && !bands.includes(view.band)) bands.push(view.band);
  return (
      <div className={`hcp-controls${direction ? "" : " hcp-controls--reception"}`}>
      {direction && <PskDirectionControl direction={view.direction} onChange={view.setDirection} />}
      <HamClockSegmented label="Reception age window" value={String(view.minutes)} onChange={v => view.setMinutes(Number(v) as PskWindowMinutes)} options={PSK_WINDOWS.map(v => ({ value: String(v), label: `${v} MIN` }))} />
      <HamClockSegmented label="Reception band" value={view.band} onChange={view.setBand} options={[
        { value: "all", label: "ALL" }, ...bands.map(b => ({ value: b, label: b.toUpperCase() })),
      ]} />
      </div>
  );
}

export function PskDirectionControl({ direction, onChange }: { direction: PskDirection; onChange: (direction: PskDirection) => void }) {
  return <HamClockSegmented label="Reception direction" value={direction} onChange={onChange} options={[
    { value: "of", label: "OF MY CALL", detail: "Who heard me" },
    { value: "by", label: "BY MY CALL", detail: "Who I heard" },
  ]} />;
}

export function PskReceptionRows({ rows, direction, state, now, compact = false }: { rows: Reception[]; direction: PskDirection; state: string; now: number; compact?: boolean }) {
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);
  return <div className={`hcp-receptions${compact ? " hcp-compact" : ""}`}>
    <div className="hcp-list" ref={ref}>{rows.slice(0, visible).map((r, i) => <div className="hcp-row" key={`${r.senderCallsign}:${r.receiverCallsign}:${r.observedAt}:${i}`}>
      <div><strong>{direction === "of" ? r.receiverCallsign : r.senderCallsign}</strong><span>{direction === "of" ? r.receiverLocator ?? "GRID —" : r.senderLocator ?? "GRID —"} · {r.snr == null ? "SNR —" : `${r.snr > 0 ? "+" : ""}${r.snr} dB`}</span></div>
      <div>{compact ? <span>{bandFromFreq(r.frequencyHz / 1000) ?? "—"} · {r.mode} · {activationAge(new Date(r.observedAt).toISOString(), now)} AGO</span> : <><span>{(r.frequencyHz / 1_000_000).toFixed(6)} MHz · {r.mode}</span><span>{activationAge(new Date(r.observedAt).toISOString(), now)} AGO · {direction === "of" ? "RX" : "TX"}</span></>}</div>
      {!compact && <TuneButton frequencyKHz={r.frequencyHz / 1000} mode={r.mode} wall />}
    </div>)}</div>
    {rows.length === 0 && <p className="hcr-note">{state === "UPDATED" ? "NO LOADED REPORTS IN THIS WINDOW" : state}</p>}
    <p className="hcr-note">TOP {visible} OF {rows.length} LOADED · NEWEST FIRST</p>
    {!compact && <div className="sr-only"><table aria-label="All loaded PSK receptions"><thead><tr>{["TX call", "TX grid", "RX call", "RX grid", "Frequency Hz", "Mode", "SNR dB", "UTC"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.senderCallsign}</td><td>{r.senderLocator}</td><td>{r.receiverCallsign}</td><td>{r.receiverLocator}</td><td>{r.frequencyHz}</td><td>{r.mode}</td><td>{r.snr ?? "UNKNOWN"}</td><td>{new Date(r.observedAt).toISOString()}</td></tr>)}</tbody></table></div>}
  </div>;
}
