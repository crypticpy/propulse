import { useState } from "react";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useUTCClock } from "@/hooks/useUTCClock";
import { activationAge, activationSourceState, currentActivations } from "@/lib/hamclock/activations";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { activationProvenance, ACTIVATION_PROGRAMS } from "@/types/activationSpots";
import { TuneButton } from "@/components/radio/TuneButton";
import { HamClockTile } from "../HamClockTile";
import { useVisibleRows } from "../useVisibleRows";
import { ActivationsReport } from "../reports/ActivationsReport";

export function ActivationsTile() {
  const [open, setOpen] = useState(false);
  const feed = useActivationSpots();
  const now = useUTCClock(10_000).getTime();
  const spots = currentActivations(feed.spots, now);
  const [ref, visible] = useVisibleRows<HTMLDivElement>(spots.length);
  const fresh = !feed.error && ACTIVATION_PROGRAMS.every((program) => activationSourceState(feed.sources.find((source) => source.program === program), now) === "CURRENT");
  return <>
    <HamClockTile grow title="Activations" source={feed.isLoading ? "READING" : fresh ? "LIVE FEEDS" : "CHECK FEEDS"} state={fresh ? "var(--hc-accent)" : "var(--hc-warn)"} onOpen={() => setOpen(true)} openLabel="Open the Activations report">
      <div className="hca-counts">{ACTIVATION_PROGRAMS.map((program) => <span key={program}>{program} <b>{feed.sources.find((source) => source.program === program)?.status === "ok" ? spots.filter((spot) => spot.program === program).length : "—"}</b></span>)}</div>
      <div className="hca-list hca-tile-list" ref={ref}>{spots.slice(0, visible).map((spot) => <div className="hca-row" key={`${spot.program}:${spot.callsign}:${spot.reference}`}>
        <div className="hca-identity"><strong>{spot.callsign}</strong><span>{spot.reference} · {bandFromFreq(spot.frequencyKHz) ?? "—"} · {spot.mode}{activationProvenance(spot) && ` · ${activationProvenance(spot)}`}</span><span>{activationAge(spot.spottedAt, now)} AGO</span></div>
        <div className="hca-tune"><TuneButton frequencyKHz={spot.frequencyKHz} mode={spot.mode === "UNKNOWN" ? null : spot.mode || null} wall /></div>
      </div>)}</div>
      <p className="hca-caption">{spots.length ? `TOP ${visible} OF ${spots.length} LOADED` : feed.isLoading ? "READING FEEDS…" : fresh ? "NO CURRENT REPORTS" : "FEED DATA UNAVAILABLE"}</p>
    </HamClockTile>
    {open && <ActivationsReport open onClose={() => setOpen(false)} />}
  </>;
}
