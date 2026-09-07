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
  return <section aria-label="Your recent operating" className="home-panel home-session">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-orbitron text-sm text-su-text">Your recent operating</h2><HomeStatus state={log.loading ? "loading" : log.error ? "error" : "local"} /></div>
    {log.error ? <p className="mt-4 text-sm text-su-warning">Your log could not be read. <button type="button" onClick={() => void log.refresh()} className="min-h-11 text-su-info underline">Try again</button></p> : log.loading ? <p className="mt-4 text-sm text-su-muted">Reading your log…</p> : <>
      <div className="mt-5 grid grid-cols-2 gap-3"><div><p className="font-mono text-3xl text-su-text">{today}</p><p className="mt-1 text-xs text-su-muted">Contacts today · UTC</p></div><div><p className="font-mono text-3xl text-su-text">{week}</p><p className="mt-1 text-xs text-su-muted">Last 7 UTC days</p></div></div>
      {!isMobile && week > 0 && <div className="mt-5 grid grid-cols-7 gap-2" aria-label="Contacts by UTC day">{days.map(day => <div key={day.date} className="text-center"><div className="flex h-12 items-end justify-center"><div aria-hidden="true" className="w-full rounded-t-sm bg-su-info/40" style={{ height: `${day.count / max * 100}%` }} /></div><p className="mt-2 font-mono text-xs text-su-muted">{day.count}</p><p className="mt-1 text-[11px] text-su-muted/80">{day.date.slice(5)}</p></div>)}</div>}
      <p className="mt-4 text-xs leading-5 text-su-muted">{latest ? <>Last logged: <strong className="font-mono text-su-text">{latest.callsign}</strong> · {latest.band} · {latest.mode}<br />{latest.date} {latest.timeOn} UTC</> : "Your first contact will start your operating history here."}</p>
    </>}
    <div className="mt-2 flex items-center justify-between gap-3"><Link to="/log" className="inline-flex min-h-11 items-center text-sm text-su-info">Open logbook →</Link><button type="button" onClick={() => void log.refresh()} disabled={log.loading} className="min-h-11 rounded-lg px-2 text-xs text-su-muted hover:bg-su-input disabled:opacity-50">Refresh log</button></div>
    <div className="mt-3 border-t border-su-line/40 pt-4"><div className="flex items-center justify-between gap-2"><h3 className="text-xs uppercase tracking-widest text-su-muted">{activeContests.length ? "On the calendar now" : "Coming next"}</h3><span className="text-xs text-su-muted/80">Scheduled</span></div>
      {events.length ? events.map(event => <div key={event.id} className="mt-3"><p className="text-sm text-su-text">{event.name}</p><p className="mt-1 text-xs leading-5 text-su-muted">{event.modes.join(" / ")} · {activeContests.length ? "Ends" : "Starts"} {new Date(activeContests.length ? event.endUtc : event.startUtc).toLocaleString(undefined, { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} UTC</p></div>) : <p className="mt-3 text-sm text-su-muted">No upcoming contests in the available calendar.</p>}
      <Link to={session ? "/contest" : "/contests"} className="mt-2 inline-flex min-h-11 items-center text-sm text-su-info">{session ? "Resume contest session" : "Explore contests"} →</Link>
    </div>
  </section>;
}
