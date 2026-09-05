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
