import { useState } from "react";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useUTCClock } from "@/hooks/useUTCClock";
import { activationAge, activationSourceState, activationSourceTime, currentActivations } from "@/lib/hamclock/activations";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { activationProvenance, activationWindowMs, ACTIVATION_PROGRAMS, ACTIVATION_PROGRAM_META, type ActivationProgram, type ActivationSpot } from "@/types/activationSpots";
import { TuneButton } from "@/components/radio/TuneButton";
import { HamClockTabs } from "../controls";
import { useVisibleRows } from "../useVisibleRows";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";

export function ActivationsReport({ open, onClose, initialProgram = "POTA" }: {
  open: boolean; onClose: () => void; initialProgram?: ActivationProgram;
}) {
  const [program, setProgram] = useState(initialProgram);
  const feed = useActivationSpots(open);
  const now = useUTCClock(10_000).getTime();
  const spots = currentActivations(feed.spots, now, program);
  const source = feed.sources.find((entry) => entry.program === program);
  const state = feed.error ? "UNAVAILABLE" : activationSourceState(source, now);
  const windowLabel = activationWindowMs(program) === 30 * 60_000 ? "30 MIN" : "2 H";
  const meta = ACTIVATION_PROGRAM_META[program];
  const { footer, updated } = reportFooter(`${meta.source.toUpperCase()} · RETRIEVED · ${state}`, activationSourceTime(source, now), now);
  return <WallReport open={open} onClose={onClose} title="Activations report" tone={state === "CURRENT" ? "accent" : "warn"}
    hero={feed.isLoading || source?.status !== "ok" ? "—" : spots.length} verdict={program}
    facts={[
      { label: `LOADED · ${windowLabel}`, value: spots.length },
      { label: "SOURCE", value: state },
      { label: "NEWEST", value: spots[0] ? activationAge(spots[0].spottedAt, now) : "—" },
      { label: "BANDS", value: new Set(spots.map((spot) => bandFromFreq(spot.frequencyKHz)).filter(Boolean)).size },
      { label: "MODES", value: new Set(spots.map((spot) => spot.mode).filter(Boolean)).size },
    ]} footer={footer} updated={updated} pinId={`activations-${program}`}
    pinElement={<ActivationsReport open onClose={onClose} initialProgram={program} />}>
    <HamClockTabs label="Activation programmes" active={program} onChange={(id) => setProgram(id as ActivationProgram)} tabs={ACTIVATION_PROGRAMS.map((id) => ({
      id, label: id, content: <ActivationRows windowLabel={windowLabel} spots={spots} now={now} loading={feed.isLoading} state={state} />,
    }))} />
  </WallReport>;
}

function ActivationRows({ spots, now, loading, state, windowLabel }: { windowLabel: string; spots: ActivationSpot[]; now: number; loading: boolean; state: string }) {
  const [ref, visible] = useVisibleRows<HTMLDivElement>(spots.length);
  return <div className="hca-report">
    <p className="hcr-note">{state === "CURRENT" ? `Reported within ${windowLabel.toLowerCase()}; a spot does not confirm the station is still on air.` : `${state} · retained reports may no longer be active.`}</p>
    <div className="hca-list" ref={ref}>
      {spots.slice(0, visible).map((spot) => <div className="hca-row" key={`${spot.program}:${spot.callsign}:${spot.reference}`}>
        <div className="hca-identity"><strong>{spot.callsign}</strong><span>{spot.reference} · {spot.referenceName}</span></div>
        <div className="hca-detail"><span>{bandFromFreq(spot.frequencyKHz) ?? "—"} · {spot.mode || "UNKNOWN"}</span><span>{activationAge(spot.spottedAt, now)} AGO · {spot.spotter || "SPOTTER UNKNOWN"}</span>{activationProvenance(spot) && <span>{activationProvenance(spot)}</span>}</div>
        <TuneButton frequencyKHz={spot.frequencyKHz} mode={spot.mode === "UNKNOWN" ? null : spot.mode || null} wall />
      </div>)}
      {spots.length === 0 && <p className="hcr-note">{loading ? "Reading activation feeds…" : state === "CURRENT" ? "No activations reported in this window." : "No current reports available from this source."}</p>}
    </div>
    <p className="hcr-note">TOP {visible} OF {spots.length} LOADED · NEWEST FIRST · UP TO 100 PER PROGRAMME</p>
    <div className="sr-only"><table aria-label="All loaded activations"><thead><tr>{["Callsign", "Reference", "Name", "Frequency kHz", "Mode", "Reported UTC", "Spotter", "Original source"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{spots.map((spot) => <tr key={`${spot.program}:${spot.callsign}:${spot.reference}`}><td>{spot.callsign}</td><td>{spot.reference}</td><td>{spot.referenceName}</td><td>{spot.frequencyKHz}</td><td>{spot.mode}</td><td>{spot.spottedAt}</td><td>{spot.spotter}</td><td>{activationProvenance(spot)}</td></tr>)}</tbody></table></div>
  </div>;
}
