import { Link } from "react-router-dom";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useActiveBandMode } from "@/hooks/useActiveBandMode";
import { useShackStore, useStationChains, useUserRadios, useUserAntennas } from "@/stores/shackStore";



export function HomeStation() {
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

  return <section aria-label="Your station" className="home-panel home-station">
    <div className="flex items-center justify-between gap-2"><h2 className="font-orbitron text-sm text-white">Your station</h2><Link to="/shack" className="inline-flex min-h-11 items-center text-xs text-cyan-200">Manage setup →</Link></div>
    {chains.length > 0 ? <select aria-label="Home active station setup" value={station.chain?.id ?? ""} onChange={event => setChain(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-void-black px-3 text-sm text-white">{!station.chain && <option value="" disabled>Choose a setup</option>}{station.chain && !chains.some(chain => chain.id === station.chain?.id) && <option value={station.chain.id}>{station.chain.name} · legacy preset</option>}{chains.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select> : <p className="mt-2 text-sm text-slate-300">{station.chain?.name ?? "Add your rig and antenna in My Shack."}</p>}
    <p className="mt-3 break-words text-sm text-slate-200">{[radio?.model, antenna?.name].filter(Boolean).join(" · ") || "Your active setup follows you into the operating tools."}</p>
    <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-slate-300"><span className="rounded-md bg-white/5 px-2 py-1.5">{activeBand} · {activeMode}</span>{station.chain && <span className="rounded-md bg-white/5 px-2 py-1.5">{station.chain.operatingPowerWatts} W configured</span>}</div>
  </section>;
}
