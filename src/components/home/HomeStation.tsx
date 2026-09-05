import { Link } from "react-router-dom";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useActiveBandMode } from "@/hooks/useActiveBandMode";
import { useShackStore, useStationChains, useUserRadios, useUserAntennas } from "@/stores/shackStore";
import { daylightDay } from "@/lib/home/presentation";

const utc = (at: number) => new Date(at).toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
export function HomeStation({ now }: { now: number }) {
  const station = useStationCastContext();
  const { activeBand, activeMode } = useActiveBandMode();
  const chains = useStationChains();
  const setChain = useShackStore(s => s.setActiveChain);
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const radioId = station.chain?.nodes.find(node => node.type === "radio")?.radioId;
  const antennaId = station.chain?.nodes.find(node => node.type === "antenna")?.antennaId;
  const radio = radios.find(r => r.userRadio.id === radioId)?.equipment;
  const antenna = antennas.find(a => a.id === antennaId);
  const daylight = station.location ? daylightDay(now, station.location.lat, station.location.lon) : null;
  return <section aria-label="Your station" className="min-w-0 rounded-2xl border border-white/10 bg-panel p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2"><h2 className="font-orbitron text-sm text-white">Your station</h2><Link to="/shack" className="inline-flex min-h-11 items-center text-xs text-cyan-200">Manage setup →</Link></div>
    {chains.length > 0 ? <select aria-label="Home active station setup" value={station.chain?.id ?? ""} onChange={event => setChain(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-void-black px-3 text-sm text-white">{!station.chain && <option value="" disabled>Choose a setup</option>}{station.chain && !chains.some(chain => chain.id === station.chain?.id) && <option value={station.chain.id}>{station.chain.name} · legacy preset</option>}{chains.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select> : <p className="mt-2 text-sm text-slate-300">{station.chain?.name ?? "Add your rig and antenna in My Shack."}</p>}
    <p className="mt-3 break-words text-sm text-slate-200">{[radio?.model, antenna?.name].filter(Boolean).join(" · ") || "Your active setup follows you into the operating tools."}</p>
    <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-slate-300"><span className="rounded-md bg-white/5 px-2 py-1.5">{activeBand} · {activeMode}</span>{station.chain && <span className="rounded-md bg-white/5 px-2 py-1.5">{station.chain.operatingPowerWatts} W configured</span>}</div>
    <div className="mt-5 border-t border-white/10 pt-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-xs uppercase tracking-wider text-slate-400">Day at your QTH</h3><span className="font-mono text-xs text-slate-300">{station.location?.grid ?? "Location needed"}</span></div>
      {daylight ? <><p className="mt-2 text-lg text-white">{daylight.daylight ? "Daylight" : "After sunset"}<span className="ml-2 text-xs text-slate-400">{station.location?.name}</span></p><div aria-label="QTH daylight through the UTC day" className="relative mt-4 flex h-6 overflow-hidden rounded-md border border-white/10">{daylight.samples.slice(0, 96).map(sample => <span key={sample.at} className={`flex-1 ${sample.daylight ? "bg-caution-amber/60" : "bg-slate-800"}`} />)}<span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${Math.min(99.5, daylight.fraction * 100)}%` }} /></div><div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400"><span>00</span><span>12</span><span>24 UTC</span></div><p className="mt-3 text-xs leading-5 text-slate-300">{daylight.events.map(event => `${event.label} ${utc(event.at)} UTC`).join(" · ") || (daylight.allDay ? "Sun above the horizon all UTC day" : daylight.allNight ? "Sun below the horizon all UTC day" : "No horizon crossing in this UTC day")}</p><p className="mt-2 text-xs leading-5 text-slate-500">Amber is daylight; the white marker is now. Local illumination alone does not predict a path opening.</p></> : <p className="mt-3 text-sm leading-6 text-slate-300">Set your operating location in <Link to="/profile" className="inline-flex min-h-11 items-center text-cyan-200 underline">Profile</Link> to see QTH daylight and use path advice.</p>}
    </div>
  </section>;
}
