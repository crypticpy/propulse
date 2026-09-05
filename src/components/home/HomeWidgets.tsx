import { useHomeLocation } from "@/hooks/useHomeLocation";
import { getMoonSnapshot } from "@/lib/utils/moon";
import { useProfileStore } from "@/stores/profileStore";
import { lazy, Suspense, useState } from "react";
import { MoonCard, PlanetsCard, WorldClocksCard, CountdownsCard, TidesCard, EnvironmentCard, MetarCard, QthScopeCard, VolcanoCard, DxpeditionsCard, NewsFeedCard, ContestWeatherCard } from "@/components/dashboard";
import { HistoryCard } from "@/components/dx/HistoryCard";

const HistoryDetail = lazy(() => import("@/components/dx/modals/HistoryDetailModal").then(m => ({ default: m.HistoryDetailModal })));
function HistoryWidget() {
  const [open, setOpen] = useState(false);
  return <><HistoryCard onClick={() => setOpen(true)} />{open && <Suspense fallback={<p className="text-xs text-slate-400">Opening history…</p>}><HistoryDetail isOpen onClose={() => setOpen(false)} /></Suspense>}</>;
}

const widgets = { moon: MoonCard, planets: PlanetsCard, clocks: WorldClocksCard, countdowns: CountdownsCard, tides: TidesCard, environment: EnvironmentCard, metar: MetarCard, scope: QthScopeCard, volcanoes: VolcanoCard, dxpeditions: DxpeditionsCard, news: NewsFeedCard, contests: ContestWeatherCard, history: HistoryWidget };
export function HomeWidgets({ ids }: { ids: string[] }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{ids.map(id => { const Widget = widgets[id as keyof typeof widgets]; return Widget ? <div key={id} className="min-w-0 [&>div]:h-full"><Widget /></div> : null; })}</div>;
}

export function HomeWidget({ id }: { id: string }) {
  const { location, guest } = useHomeLocation();
  const profile = useProfileStore(s => s.station);
  if (guest && ["history", "countdowns"].includes(id)) return <p>Sign in to view your saved personal panel.</p>;
  if (guest && id === "clocks") return <section aria-label="World clocks">{["UTC", "Europe/London", "America/New_York", "Asia/Tokyo"].map(zone => <p key={zone}>{zone.replace(/_/g, " ")} · <time>{new Date().toLocaleTimeString(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false })}</time></p>)}<p>Sign in to customize your saved clocks.</p></section>;
  if (id === "moon") {
    const moon = getMoonSnapshot(new Date(), location?.lat ?? 0, location?.lon ?? 0);
    return <section aria-label="Moon"><div className="home-moon-reading"><span aria-hidden="true">{moon.emoji}</span><div><h3>{moon.phaseName}</h3><p>{Math.round(moon.illumination*100)}% illuminated</p></div></div>{location ? <><p>{location.grid} · Rise {moon.rise?.toISOString().slice(11,16) ?? "—"} · Set {moon.set?.toISOString().slice(11,16) ?? "—"} UTC</p><p>Altitude {moon.altitude.toFixed(0)}°</p></> : <p>Set your Home location for local rise and set times.</p>}</section>;
  }
  if (["planets", "tides", "environment", "metar", "scope"].includes(id)) {
    if (guest || !profile?.grid) return <p>This panel uses a saved Profile location. Local weather, daylight, and Moon above work with your guest location.</p>;
    const Widget = widgets[id as keyof typeof widgets];
    return <><p className="home-note">Profile location: {profile.grid}. This panel uses your saved Profile location.</p><Widget /></>;
  }
  const Widget = widgets[id as keyof typeof widgets];
  return Widget ? <Widget /> : null;
}
