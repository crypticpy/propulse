import { useEffect, useState } from "react";
import SunCalc from "suncalc";
import { Link } from "react-router-dom";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { daylightDay } from "@/lib/home/presentation";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { accentForHomeItem } from "@/lib/themes/sectionAccent";
import { homeItemSummary } from "@/lib/home/layout";
import { SectionHeader } from "@/components/ui/SectionHeader";

/** The chronologically next sunrise/sunset from `now`, rolling into tomorrow when today's
 * crossings have both already passed. Returns null for polar day/night, where SunCalc has no
 * crossing to report. */
function nextSunEvent(now: number, lat: number, lon: number): { label: string; at: number } | null {
  for (const offset of [0, 1]) {
    const times = SunCalc.getTimes(new Date(now + offset * 86_400_000), lat, lon);
    for (const [label, date] of [["Sunrise", times.sunrise], ["Sunset", times.sunset]] as const) {
      const at = date.getTime();
      if (Number.isFinite(at) && at > now) return { label, at };
    }
  }
  return null;
}

export function HomeDaylight({ now }: { now: number }) {
  const { location } = useHomeLocation();
  const day = location ? daylightDay(now, location.lat, location.lon) : null;
  const altitude = (at: number) => SunCalc.getPosition(new Date(at), location!.lat, location!.lon).altitude * 180 / Math.PI;
  const y = (at: number) => 65 - altitude(at) * 0.58;
  const [open, setOpen] = useState(false);
  const phase = day ? (day.daylight ? "Daylight now" : "After sunset") : null;
  const next = day ? nextSunEvent(now, location!.lat, location!.lon) : null;
  const subText = day ? `${phase}${next ? ` · ${next.label.toLowerCase()} ${new Date(next.at).toISOString().slice(11, 16)} UTC` : ""}` : null;
  const crossings = day
    ? (day.events.map(event => `${event.label} ${new Date(event.at).toISOString().slice(11,16)} UTC`).join(" · ")
      || (day.allDay ? "Sun above the horizon all UTC day" : day.allNight ? "Sun below the horizon all UTC day" : "No horizon crossing today"))
    : "";
  useEffect(() => {
    if (!day) setOpen(false);
  }, [day]);
  return <section className="home-panel home-daylight su-section-panel" data-accent={accentForHomeItem("daylight")} aria-label="Daylight at your location">
    <div aria-hidden="true" className="su-section-rule" />
    <SectionHeader className="su-widget-header" title="Daylight" summary={homeItemSummary("daylight")} action={<span>{location?.grid ?? "Location needed"}</span>} />
    <div className="home-panel-body">
    {day ? <><svg viewBox="0 0 340 150" role="img" aria-label="Solar altitude through the UTC day"><path d="M10 65H330" className="home-chart-axis" /><polyline points={day.samples.map((sample, i) => `${10+i/96*320},${y(sample.at)}`).join(" ")} className="home-chart-line" /><path d={`M${10+day.fraction*320} 8V118`} className="home-chart-now" /><circle cx={10+day.fraction*320} cy={y(now)} r="4" className="home-chart-dot" /><text x="10" y="145">00 UTC</text><text x="163" y="145">12</text><text x="307" y="145">24</text></svg>
      <p className="home-card-sub">{subText}</p>
      <div className="home-actions"><button type="button" aria-haspopup="dialog" aria-label="Daylight details" onClick={() => setOpen(true)}>Details</button></div>
    </> : <p>Set your location to see sunrise, sunset, and daylight. No sign-in needed.</p>}
    <AccessibleDialog open={open} onClose={() => setOpen(false)} title="Daylight details" description="Today's sunrise and sunset, and how to read the chart.">
      <div className="home-dashboard home-daylight-dialog">
        <p>{crossings}</p>
        <p className="home-note">The marker is now. Local daylight is context, not a path-opening prediction.</p>
        <div className="home-actions"><Link to="/map">View daylight map ↗</Link></div>
      </div>
    </AccessibleDialog>
    </div>
  </section>;
}
