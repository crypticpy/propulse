import { usePskStationData } from "@/hooks/usePskStation";
import { WsjtxHeardReport } from "./WsjtxHeardReport";
import { useState, type ReactNode } from "react";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigStore } from "@/stores/rigStore";
import { useUTCClock } from "@/hooks/useUTCClock";
import { recentWSJTXDecodes, wsjtxSourceState, wsjtxTuneReason, wsjtxUtc } from "@/lib/hamclock/wsjtx";
import { activationAge } from "@/lib/hamclock/activations";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { TuneButton } from "@/components/radio/TuneButton";
import { HamClockTabs } from "../controls";
import { useVisibleRows } from "../useVisibleRows";
import { reportFooter } from "../tokens";
import { WallReport, type WallReportProps } from "./WallReport";

export function WsjtxReport({ open, onClose, initialTab = "recent" }: { open: boolean; onClose: () => void; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  const heardData = usePskStationData(open && tab === "heard", "of");
  const stored = useWSJTXStore(s => s.decodes);
  const decodes = [...stored].sort((a, b) => b.receivedAt - a.receivedAt);
  const enabled = useSettingsStore(s => s.bridgeEnabled);
  const connected = useRigStore(s => s.bridgeConnected);
  const now = useUTCClock(10_000).getTime();
  const recent = recentWSJTXDecodes(decodes, now);
  const state = wsjtxSourceState(enabled, connected, decodes[0]?.receivedAt, now);
  const rows = tab === "recent" ? recent : decodes;
  const { footer, updated } = reportFooter(`WSJT-X BRIDGE · ${state} · RECEIVED`, decodes[0]?.receivedAt ?? null, now);
  const navigation = (heardContent?: ReactNode) => <HamClockTabs label="WSJT-X decode views" active={tab} onChange={setTab} tabs={[
    { id: "recent", label: "NEW · 15 MIN", content: <WsjtxRows rows={rows} state={state} /> },
    { id: "all", label: "ALL RETAINED", content: <WsjtxRows rows={rows} state={state} /> },
    { id: "heard", label: "HEARING ME", content: heardContent },
  ]} />;
  const decodePresentation = {
    tone: state === "RECEIVING" ? "accent" as const : "warn" as const,
    hero: recent.length, verdict: state, facts: [
      { label: "NEW · 15 MIN", value: recent.length },
      { label: "CALLSIGNS", value: new Set(recent.map(d => d.callsign).filter(Boolean)).size },
      { label: "CQ", value: recent.filter(d => /^CQ\s/.test(d.message)).length },
      { label: "BANDS", value: new Set(recent.map(d => d.dialFrequencyHz ? bandFromFreq(d.dialFrequencyHz / 1000) : null).filter(Boolean)).size },
      { label: "RETAINED", value: decodes.length },
      { label: "LAST RX", value: decodes[0] ? activationAge(new Date(decodes[0].receivedAt).toISOString(), now) : "—" },
    ], footer, updated,
  };
  return <WallReport open={open} onClose={onClose} title="WSJT-X report"
    {...(tab === "heard" ? wsjtxHeardPresentation(heardData) : decodePresentation)}
    pinId="wsjtx" pinElement={<WsjtxReport open onClose={onClose} initialTab={tab} />}>
    {navigation(<WsjtxHeardReport data={heardData} />)}
  </WallReport>;
}

function wsjtxHeardPresentation(data: ReturnType<typeof usePskStationData>): Pick<WallReportProps, "hero" | "verdict" | "tone" | "facts" | "footer" | "updated"> {
  const { feed, view, rows, state, now } = data;
  const known = feed.data?.fetchedAt != null;
  const { footer, updated } = reportFooter(`PSK REPORTER · ${state} · RETRIEVED`, feed.data?.fetchedAt ?? null, now);
  return { hero: known ? rows.length : "—", verdict: "HEARING ME", tone: state === "UPDATED" ? "accent" : "warn", facts: [
      { label: "MY CALL", value: feed.callsign ?? "—" },
      { label: "RECEIVERS", value: known ? new Set(rows.map(r => r.receiverCallsign)).size : "—" },
      { label: "WINDOW", value: `${view.minutes} MIN` },
      { label: "BAND", value: view.band === "all" ? "ALL" : view.band.toUpperCase() },
      { label: "SOURCE", value: state },
      { label: "NEWEST", value: rows[0] ? activationAge(new Date(rows[0].observedAt).toISOString(), now) : "—" },
    ], footer, updated };
}

export function WsjtxRows({ rows, state, compact = false }: { rows: readonly WSJTXDecode[]; state: string; compact?: boolean }) {
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);
  return <div className={`hcw-decodes${compact ? " hcw-compact" : ""}`}>
    {!compact && <p className="hcr-note">TUNE restores the captured dial and receive mode. Audio offset stays in WSJT-X; no reply or transmit command is sent.</p>}
    <div className="hcw-list" ref={ref}>{rows.slice(0, visible).map((d, index) => <div className={`hcw-row${/^CQ\s/.test(d.message) ? " hcw-cq" : ""}`} key={`${d.instanceId}:${d.receivedAt}:${index}`}>
      <div className="hcw-call"><strong>{d.callsign || "CALL UNKNOWN"}</strong><span>{d.grid || "GRID —"} · {d.snr > 0 ? "+" : ""}{d.snr} dB · DT {d.deltaTime.toFixed(1)}s</span></div>
      <div className="hcw-message"><span>{d.message}</span><span>{wsjtxUtc(d.time)} UTC · {d.dialMode || d.mode || "MODE —"} · {d.deltaFrequency} Hz · {d.instanceId || "INSTANCE —"}{!d.isNew ? " · REPLAY" : d.offAir ? " · OFF AIR" : d.lowConfidence ? " · LOW CONF" : ""}</span></div>
      <TuneButton frequencyKHz={(d.dialFrequencyHz ?? NaN) / 1000} mode={d.dialMode || null} unavailableReason={wsjtxTuneReason(d)} wall />
    </div>)}</div>
    {rows.length === 0 && <p className="hcr-note">{state === "BRIDGE OFF" ? "BRIDGE OFF" : state === "NO DECODES YET" ? "NO DECODES YET" : "NO NEW DECODES IN WINDOW"}</p>}
    <p className="hcr-note">TOP {visible} OF {rows.length} · NEWEST RECEIVED FIRST{!compact && " · UP TO 500 RETAINED"}</p>
    {!compact && <div className="sr-only"><table aria-label="All WSJT-X decodes"><thead><tr>{["Callsign", "Grid", "SNR dB", "DT seconds", "Message", "UTC", "Dial Hz", "Audio Hz", "Mode", "Instance", "State"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((d, index) => <tr key={index}><td>{d.callsign}</td><td>{d.grid}</td><td>{d.snr}</td><td>{d.deltaTime}</td><td>{d.message}</td><td>{wsjtxUtc(d.time)}</td><td>{d.dialFrequencyHz ?? "UNKNOWN"}</td><td>{d.deltaFrequency}</td><td>{d.dialMode || d.mode}</td><td>{d.instanceId}</td><td>{wsjtxTuneReason(d) || "NEW"}</td></tr>)}</tbody></table></div>}
  </div>;
}
