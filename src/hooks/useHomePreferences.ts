import { useState } from "react";
export const HOME_WIDGETS = [
  ["moon", "Moon"], ["planets", "Planets"], ["clocks", "World clocks"], ["countdowns", "Countdowns"], ["tides", "Tides"], ["environment", "UV & air quality"], ["metar", "Aviation weather"], ["scope", "QTH scope"], ["volcanoes", "Volcano watch"], ["dxpeditions", "DXpeditions"], ["news", "Radio news"], ["contests", "Contest details"], ["history", "This day in history"],
] as const;
const key = "propulse-home-widgets-v1";
type Preferences = { desktop: string[]; mobile: string[] };
export function readHomePreferences(value: string | null): Preferences {
  const empty: Preferences = { desktop: [], mobile: [] };
  try {
    const parsed = JSON.parse(value ?? "null");
    for (const device of ["desktop", "mobile"] as const) {
      if (Array.isArray(parsed?.[device])) empty[device] = [...new Set<string>(parsed[device].filter((id: unknown) => HOME_WIDGETS.some(([known]) => known === id)))];
    }
  } catch { /* Malformed or unavailable storage keeps the focused default. */ }
  return empty;
}
export function useHomePreferences(isMobile: boolean, guest = false) {
  const [preferences, setPreferences] = useState(() => {
    try { return readHomePreferences(guest ? null : localStorage.getItem(key)); } catch { return readHomePreferences(null); }
  });
  const device = isMobile ? "mobile" : "desktop";
  const toggle = (id: string) => setPreferences(previous => {
    const active = previous[device];
    const next = { ...previous, [device]: active.includes(id) ? active.filter(item => item !== id) : [...active, id] };
    try { if (!guest) localStorage.setItem(key, JSON.stringify(next)); } catch { /* Memory preferences remain usable. */ }
    return next;
  });
  return { pinned: preferences[device], toggle };
}
