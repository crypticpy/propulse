import { useEffect } from "react";
import { subscribeLogEntries } from "@/lib/db/logStore";
import { Link } from "react-router-dom";
import { useLogbook } from "@/hooks/useLogbook";
import { useContestContext } from "@/hooks/useContestContext";
import { useContestStore } from "@/stores/contestStore";
import { recentContacts } from "@/lib/home/presentation";
import { HomeStatus } from "./HomeStatus";

export function HomeSession({ now, isMobile }: { now: number; isMobile: boolean }) {
  const log = useLogbook();
  const { refresh } = log;
  useEffect(() => subscribeLogEntries(() => { void refresh(); }), [refresh]);
  const { days, today, week, latest } = recentContacts(log.entries, now);
  const { activeContests, upcomingContests } = useContestContext();
  const session = useContestStore(s => s.activeSession);
  const events = (activeContests.length ? activeContests : upcomingContests).slice(0, 2);
  const max = Math.max(1, ...days.map(day => day.count));
  return <section aria-label="Your recent operating" className="min-w-0 rounded-2xl border border-white/10 bg-panel p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-orbitron text-sm text-white">Your recent operating</h2><HomeStatus state={log.loading ? "loading" : log.error ? "error" : "local"} /></div>
    {log.error ? <p className="mt-4 text-sm text-amber-200">Your log could not be read. <button type="button" onClick={() => void log.refresh()} className="min-h-11 text-cyan-200 underline">Try again</button></p> : log.loading ? <p className="mt-4 text-sm text-slate-400">Reading your log…</p> : <>
      <div className="mt-5 grid grid-cols-2 gap-3"><div><p className="font-mono text-3xl text-white">{today}</p><p className="mt-1 text-xs text-slate-400">Contacts today · UTC</p></div><div><p className="font-mono text-3xl text-white">{week}</p><p className="mt-1 text-xs text-slate-400">Last 7 UTC days</p></div></div>
      {!isMobile && <div className="mt-5 grid grid-cols-7 gap-2" aria-label="Contacts by UTC day">{days.map(day => <div key={day.date} className="text-center"><div className="flex h-12 items-end justify-center"><div aria-hidden="true" className="w-full rounded-t-sm bg-cyan-300/40" style={{ height: `${day.count / max * 100}%` }} /></div><p className="mt-2 font-mono text-xs text-slate-300">{day.count}</p><p className="mt-1 text-[11px] text-slate-500">{day.date.slice(5)}</p></div>)}</div>}
      <p className="mt-4 text-xs leading-5 text-slate-300">{latest ? <>Last logged: <strong className="font-mono text-white">{latest.callsign}</strong> · {latest.band} · {latest.mode}<br />{latest.date} {latest.timeOn} UTC</> : "Your first contact will start your operating history here."}</p>
    </>}
    <div className="mt-2 flex items-center justify-between gap-3"><Link to="/log" className="inline-flex min-h-11 items-center text-sm text-cyan-200">Open logbook →</Link><button type="button" onClick={() => void log.refresh()} disabled={log.loading} className="min-h-11 rounded-lg px-2 text-xs text-slate-400 hover:bg-white/5 disabled:opacity-50">Refresh log</button></div>
    <div className="mt-3 border-t border-white/10 pt-4"><div className="flex items-center justify-between gap-2"><h3 className="text-xs uppercase tracking-widest text-slate-400">{activeContests.length ? "On the calendar now" : "Coming next"}</h3><span className="text-xs text-slate-500">Scheduled</span></div>
      {events.length ? events.map(event => <div key={event.id} className="mt-3"><p className="text-sm text-white">{event.name}</p><p className="mt-1 text-xs leading-5 text-slate-400">{event.modes.join(" / ")} · {activeContests.length ? "Ends" : "Starts"} {new Date(activeContests.length ? event.endUtc : event.startUtc).toLocaleString(undefined, { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} UTC</p></div>) : <p className="mt-3 text-sm text-slate-400">No upcoming contests in the available calendar.</p>}
      <Link to={session ? "/contest" : "/contests"} className="mt-2 inline-flex min-h-11 items-center text-sm text-cyan-200">{session ? "Resume contest session" : "Explore contests"} →</Link>
    </div>
  </section>;
}
