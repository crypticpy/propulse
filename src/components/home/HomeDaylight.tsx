import SunCalc from "suncalc";
import { Link } from "react-router-dom";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { daylightDay } from "@/lib/home/presentation";
export function HomeDaylight({ now }: { now: number }) {
  const { location } = useHomeLocation();
  const day = location ? daylightDay(now, location.lat, location.lon) : null;
  const altitude = (at: number) => SunCalc.getPosition(new Date(at), location!.lat, location!.lon).altitude * 180 / Math.PI;
  const y = (at: number) => 65 - altitude(at) * 0.58;
  return <section className="home-panel home-daylight" aria-label="Daylight at your location"><div className="home-panel-heading"><h2>Daylight</h2><span>{location?.grid ?? "Location needed"}</span></div>
    {day ? <><h3>{day.daylight ? "Daylight at your location" : "After sunset"}</h3><svg viewBox="0 0 340 140" role="img" aria-label="Solar altitude through the UTC day"><path d="M10 65H330" className="home-chart-axis" /><polyline points={day.samples.map((sample, i) => `${10+i/96*320},${y(sample.at)}`).join(" ")} className="home-chart-line" /><path d={`M${10+day.fraction*320} 8V118`} className="home-chart-now" /><circle cx={10+day.fraction*320} cy={y(now)} r="4" className="home-chart-dot" /><text x="10" y="137">00 UTC</text><text x="163" y="137">12</text><text x="307" y="137">24</text></svg><p>{day.events.map(event => `${event.label} ${new Date(event.at).toISOString().slice(11,16)} UTC`).join(" · ") || (day.allDay ? "Sun above the horizon all UTC day" : day.allNight ? "Sun below the horizon all UTC day" : "No horizon crossing today")}</p><p className="home-note">The marker is now. Local daylight is context, not a path-opening prediction.</p></> : <p>Set your location to see sunrise, sunset, and daylight. No sign-in needed.</p>}
    <div className="home-actions"><Link to="/map">View daylight map ↗</Link></div>
  </section>;
}
