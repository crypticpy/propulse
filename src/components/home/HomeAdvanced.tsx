import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useSettingsStore } from "@/stores/settingsStore";
import type { NoiseEnvironment } from "@/lib/utils/noiseModel";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { useHomeBandActivity } from "@/hooks/useHomeBandActivity";
import type { useSolarModel } from "@/hooks/useSolarModel";
import { useActiveMode } from "@/hooks/useActiveBandMode";
import { useMapStore } from "@/stores/mapStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { buildHomeForecast } from "@/lib/home/forecast";
import type { AntennaType } from "@/lib/data/antennas";
import { HomeWeather } from "./HomeWeather";
export function HomeAdvanced({ model, now, publicActivity }: { model: ReturnType<typeof useSolarModel>; now: number; publicActivity: boolean }) {
  const { location, station, guest } = useHomeLocation();
  const activity = useHomeBandActivity(now, publicActivity);
  const mapTarget = useMapStore(s => s.target);
  const activeMode = useActiveMode();
  const [targetGrid, setTargetGrid] = useState(guest ? "" : mapTarget?.grid?.slice(0, 6) ?? "");
  const [mode, setMode] = useState<"SSB" | "CW" | "FT8">(activeMode === "CW" ? "CW" : activeMode === "SSB" ? "SSB" : "FT8");
  const [powerOverride, setPower] = useState<string | null>(null);
  const power = powerOverride ?? String(guest ? 100 : station.chain?.operatingPowerWatts ?? 100);
  const activeStation = useActiveStationGain();
  const savedNoise = useSettingsStore(s => s.noiseEnvironment);
  const [antennaOverride, setAntenna] = useState<AntennaType | null>(null);
  const antenna = antennaOverride ?? (guest ? "dipole" : activeStation.antennaType);
  const [noiseOverride, setNoise] = useState<NoiseEnvironment | null>(null);
  const noise = noiseOverride ?? (guest ? "residential" : savedNoise);
  const targetValid = (targetGrid.length === 4 || targetGrid.length === 6) && isValidGrid(targetGrid);
  const solarCurrent = [model.resources.kp.state,model.resources.flux.state].every(state => state === "fresh" || state === "refreshing");
  const columns = useMemo(() => location && targetValid && solarCurrent && model.current.kp && model.current.flux ? buildHomeForecast({ origin: location, target: gridToLatLon(targetGrid), now, kp: model.current.kp.kp, sfi: model.current.flux.flux, predictedKp: model.current.predictedKp, fluxForecast: model.resources.forecast.state === "fresh" || model.resources.forecast.state === "refreshing" ? model.resources.forecast.data : undefined, mode, power: Number(power), antenna, noise }) : [], [location,targetGrid,targetValid,solarCurrent,model,now,mode,power,antenna,noise]);
  const bandNames = ["160m","80m","40m","30m","20m","17m","15m","12m","10m"];
  return <section className="home-panel home-advanced" aria-label="Advanced dashboard"><div className="home-panel-heading"><div><p className="home-eyebrow">Advanced dashboard</p><h2>Current bands & the next 12 hours</h2></div><Link to="/solar">Deeper solar detail ↗</Link></div>
    <div className="home-advanced-grid"><section><h3>Current · reported activity</h3><p>{activity.scopeLabel} · all modes · last 20 minutes</p>{!publicActivity ? <p>Public reports are hidden by your operating policy.</p> : !activity.current ? <p>Current reports are unavailable; conditions remain unknown.</p> : <div className="home-table-wrap"><table><caption>Reception and cluster reports by mode</caption><thead><tr><th>Band</th><th>Phone</th><th>Digital</th><th>CW</th><th>Other</th></tr></thead><tbody>{activity.rows.map(row => <tr key={row.band}><th>{row.band}</th>{["phone","digital","cw","unknown"].map(key => <td key={key}>{(row.modeObs20m[key as keyof typeof row.modeObs20m] ?? 0).toLocaleString()}</td>)}</tr>)}</tbody></table></div>}<p className="home-note">Zero reports means unknown conditions. Counts describe the reporting network, not your station’s reception.</p></section>
    <section><h3>Forecast · modeled path outlook</h3><p>From {location?.grid ?? "a location you choose"}. Select a target and check the assumptions.</p><div className="home-forecast-controls"><label>Target grid<input value={targetGrid} onChange={e=>setTargetGrid(e.target.value.toUpperCase())} placeholder="e.g. JO31" maxLength={6} /></label><label>Forecast mode<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option>SSB</option><option>CW</option><option>FT8</option></select></label><label>Power · W<input type="number" min="1" max="1500" value={power} onChange={e=>setPower(e.target.value)} /></label><label>Antenna model<select value={antenna} onChange={e=>setAntenna(e.target.value as AntennaType)}><option value="dipole">Dipole</option><option value="vertical">Vertical</option><option value="yagi_3el">3-element Yagi</option><option value="wire_inverted_v">Inverted V</option><option value="yagi_5el">5-element Yagi</option><option value="hex_beam">Hex beam</option><option value="nvis_dipole">NVIS dipole</option><option value="isotropic">Isotropic</option></select></label><label>Noise environment<select value={noise} onChange={e=>setNoise(e.target.value as NoiseEnvironment)}><option value="city">City</option><option value="residential">Residential</option><option value="rural">Rural</option><option value="quiet_rural">Quiet rural</option></select></label></div>
      <p className="home-note">{!guest && station.chain && powerOverride === null ? "Power follows your active setup. " : "Power is an explicit assumption. "}Antenna and noise follow your saved settings when signed in, until changed here. The antenna is simplified: feedline losses, amplifiers, terrain, and pointing are not modeled. The other station uses 0 dBi gain. Estimates are not contact probabilities.</p>
      {columns.length ? <><div className="home-table-wrap" tabIndex={0} role="region" aria-label="Scrollable band forecast"><table className="home-forecast-table"><caption>Modeled band outlook · UTC · date shown at rollover</caption><thead><tr><th>Band</th>{columns.map(column=><th key={column.at}>{new Date(column.at).toISOString().slice(5,10)}<br />{new Date(column.at).toISOString().slice(11,16)}</th>)}</tr></thead><tbody>{bandNames.map(band=><tr key={band}><th>{band}</th>{columns.map(column=>{const condition=column.bands.find(value=>value.band===band);const label=condition?.status === "excellent" || condition?.status === "good" ? "Stronger" : condition?.status === "fair" ? "Mixed" : condition ? "Limited" : "Unknown";return <td key={column.at}><span className={`home-forecast-cell home-forecast-${label.toLowerCase()}`}>{label}</span></td>;})}</tr>)}</tbody></table></div><details className="home-source-details"><summary>Forecast inputs & uncertainty</summary><p>Relative outlook from the existing propagation model, not a calibrated chance of a QSO. "Limited" does not mean a measured closed band.</p>{columns.map(column=><p key={column.at}>{new Date(column.at).toUTCString()} · Kp {column.kp} ({column.kpSource}); SFI {column.sfi} ({column.fluxSource}).</p>)}<p>Solar inputs must be current. Where an official forecast is unavailable, current values are held constant and identified above.</p></details></> : <p>{!location ? "Set your Home location for a path forecast." : !targetValid ? "Enter a valid 4- or 6-character target grid to view the forecast." : !solarCurrent ? "Awaiting current Kp and solar flux. Forecast estimates are withheld while these inputs are unavailable or stale." : "Enter power between 1 and 1500 W."}</p>}
    </section></div><HomeWeather now={now} detailed />
  </section>;
}
