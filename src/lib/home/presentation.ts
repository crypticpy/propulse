import SunCalc from "suncalc";
import type { BandActivityStatus } from "@/hooks/useBandActivity";
import type { LogEntry } from "@/lib/db/types";

export function activityRows(data: Map<string, BandActivityStatus> | undefined) {
  return [...(data?.values() ?? [])]
    .filter(row => Number.isSafeInteger(row.obs20m) && row.obs20m >= 0 && Number.isSafeInteger(row.reporters20m) && row.reporters20m >= 0)
    .sort((a, b) => b.obs20m - a.obs20m || a.band.localeCompare(b.band));
}

/** A checked response is not an observation timestamp. Withhold old counts. */
export function activityIsCurrent(updatedAt: number, error: boolean, now: number) {
  return !error && updatedAt > 0 && updatedAt <= now && now - updatedAt < 120_000;
}

/** UTC day avoids guessing the active QTH's civil timezone. Sample actual solar
 * altitude so a UTC day crossing local midnight and polar days remain valid. */
export function daylightDay(now: number, lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const start = Math.floor(now / 86_400_000) * 86_400_000;
  const samples = Array.from({ length: 97 }, (_, i) => {
    const at = start + i * 900_000;
    return { at, daylight: SunCalc.getPosition(new Date(at), lat, lon).altitude > -0.01454 };
  });
  const events: Array<{ label: string; at: number }> = [];
  for (let day = -1; day <= 1; day++) {
    const times = SunCalc.getTimes(new Date(start + 43_200_000 + day * 86_400_000), lat, lon);
    for (const [label, date] of [["Sunrise", times.sunrise], ["Sunset", times.sunset]] as const) {
      const at = date.getTime();
      if (Number.isFinite(at) && at >= start && at < start + 86_400_000 && !events.some(e => e.label === label && Math.abs(e.at - at) < 60_000)) events.push({ label, at });
    }
  }
  const daylight = SunCalc.getPosition(new Date(now), lat, lon).altitude > -0.01454;
  return { start, samples, events: events.sort((a, b) => a.at - b.at), daylight, allDay: samples.every(s => s.daylight), allNight: samples.every(s => !s.daylight), fraction: (now - start) / 86_400_000 };
}

export function recentContacts(entries: LogEntry[], now: number) {
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  const days = Array.from({ length: 7 }, (_, i) => ({ date: new Date(today - (6 - i) * 86_400_000).toISOString().slice(0, 10), count: 0 }));
  const valid = entries.filter(entry => {
    const at = Date.parse(`${entry.date}T${entry.timeOn.length === 5 ? `${entry.timeOn}:00` : entry.timeOn}Z`);
    return Number.isFinite(at) && at <= now;
  });
  for (const entry of valid) {
    const day = days.find(day => day.date === entry.date);
    if (day) day.count++;
  }
  const latest = [...valid].sort((a, b) => `${b.date}T${b.timeOn}`.localeCompare(`${a.date}T${a.timeOn}`))[0];
  return { days, today: days[6].count, week: days.reduce((sum, day) => sum + day.count, 0), latest };
}
