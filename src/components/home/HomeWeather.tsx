import { useState } from "react";
import SunCalc from "suncalc";
import { useQuery } from "@tanstack/react-query";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { fetchHomeWeather, weatherIsCurrent } from "@/lib/home/weather";
import { weatherCodeToDescription } from "@/lib/api/openMeteo";
import { HomeStatus } from "./HomeStatus";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

export function HomeWeather({ now, detailed = false }: { now: number; detailed?: boolean }) {
  const { location } = useHomeLocation();
  const query = useQuery({ queryKey: ["home-weather", location?.lat, location?.lon], queryFn: ({ signal }) => fetchHomeWeather(location!.lat, location!.lon, signal), enabled: !!location, staleTime: 15 * 60000, refetchInterval: 15 * 60000, retry: 1 });
  const data = query.data;
  const usable = data && !query.isError && weatherIsCurrent(data.at, now);
  const status = location && <HomeStatus state={query.isError ? "error" : query.isPending ? "loading" : usable ? "fresh" : "stale"} />;
  const [open, setOpen] = useState(false);

  // The Advanced dashboard's full report keeps the original inline layout — no card-height
  // budget applies there, so it is left byte-for-byte as it was before DS-11.
  if (detailed) {
    const hours = usable ? data.hours.filter(hour => hour.at >= now && hour.at <= now + 12 * 3600000).slice(0, 12) : [];
    return <section className="home-panel home-weather" aria-label="Weather at your location"><div className="home-panel-heading"><h2>Local weather</h2>{status}</div>
      <p className="home-note">{location ? `${location.grid} · weather model` : "Set your location for local weather. No sign-in needed."}</p>
      {location && (usable ? <><div className="home-weather-reading"><span aria-hidden="true" className="home-weather-icon">{data.code < 4 ? (SunCalc.getPosition(new Date(now), location.lat, location.lon).altitude > 0 ? "☀" : "☾") : "☁"}</span><div><strong>{Math.round(data.temperature)}° C</strong><p>{weatherCodeToDescription(data.code)}</p></div></div><p>Wind {Math.round(data.wind)} km/h{data.gusts !== null ? ` · gusts ${Math.round(data.gusts)}` : ""}</p>
        <div className="home-weather-hours">{hours.map(hour => <div key={hour.at}><time dateTime={new Date(hour.at).toISOString()}>{new Date(hour.at).toLocaleTimeString(undefined, { timeZone: data.timezone, hour: "2-digit", minute: "2-digit", hour12: false })}</time><strong>{Math.round(hour.temperature)}°</strong><span>{hour.rain === null ? "Rain unknown" : `Rain ${hour.rain}%`}</span></div>)}</div>{hours.length === 0 && <p>Hourly forecast unavailable.</p>}<p className="home-note">Forecast · {data.timezone}<br />Current model time {new Date(data.at).toLocaleTimeString(undefined, { timeZone: data.timezone, hour: "2-digit", minute: "2-digit" })}</p></> : <p>{query.isPending ? "Checking local weather…" : "Weather updates are unavailable. We retry automatically."}</p>)}
      <div className="home-actions"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo ↗</a>{location && <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh weather</button>}</div>
    </section>;
  }

  const sixHour = usable ? data.hours.filter(hour => hour.at >= now && hour.at <= now + 6 * 3600000) : [];
  const sixMin = sixHour.length ? Math.round(Math.min(...sixHour.map(h => h.temperature))) : null;
  const sixMax = sixHour.length ? Math.round(Math.max(...sixHour.map(h => h.temperature))) : null;
  const dialogHours = usable ? data.hours.filter(hour => hour.at >= now && hour.at <= now + 12 * 3600000).slice(0, 12) : [];

  return <section className="home-panel home-weather" aria-label="Weather at your location">
    <div className="home-panel-heading"><h2>Local weather</h2>{status}</div>
    {!location ? <p className="home-note">Set your location for local weather. No sign-in needed.</p>
      : !usable ? <p className="home-note">{query.isPending ? "Checking local weather…" : "Weather updates are unavailable. We retry automatically."}</p>
      : <>
        <div className="home-weather-reading"><span aria-hidden="true" className="home-weather-icon">{data.code < 4 ? (SunCalc.getPosition(new Date(now), location.lat, location.lon).altitude > 0 ? "☀" : "☾") : "☁"}</span><div><strong>{Math.round(data.temperature)}° C</strong><p>{weatherCodeToDescription(data.code)}</p></div></div>
        <p className="home-weather-wind">Wind {Math.round(data.wind)} km/h{data.gusts !== null ? ` · gusts ${Math.round(data.gusts)}` : ""}</p>
        <p className="home-card-sub">{sixMin !== null && sixMax !== null ? `Next 6h · ${sixMin}–${sixMax}° C` : "Hourly forecast unavailable."}</p>
        <div className="home-actions"><button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>Details</button></div>
        <AccessibleDialog open={open} onClose={() => setOpen(false)} title="Local weather details" description="Hourly forecast, model time, and source.">
          <div className="home-dashboard home-weather-dialog">
            <div className="home-weather-hours">{dialogHours.map(hour => <div key={hour.at}><time dateTime={new Date(hour.at).toISOString()}>{new Date(hour.at).toLocaleTimeString(undefined, { timeZone: data.timezone, hour: "2-digit", minute: "2-digit", hour12: false })}</time><strong>{Math.round(hour.temperature)}°</strong><span>{hour.rain === null ? "Rain unknown" : `Rain ${hour.rain}%`}</span></div>)}</div>
            {dialogHours.length === 0 && <p>Hourly forecast unavailable.</p>}
            <p className="home-note">Forecast · {data.timezone}<br />Current model time {new Date(data.at).toLocaleTimeString(undefined, { timeZone: data.timezone, hour: "2-digit", minute: "2-digit" })}</p>
            <div className="home-actions"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo ↗</a><button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh weather</button></div>
          </div>
        </AccessibleDialog>
      </>}
  </section>;
}
