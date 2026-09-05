import { useState, type ReactNode } from "react";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useAuthStore } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import type { OperatingLocation } from "@/types/user";
import { HomeLocationContext, parseHomeLocation } from "@/hooks/useHomeLocation";
export function HomeLocationProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore(s => s.user?.id);
  const guest = isSupabaseConfigured && !userId;
  const scope = isSupabaseConfigured ? userId ? `user:${userId}` : "guest" : "local";
  // Remount before rendering a new identity, so its first render cannot expose
  // the previous operator's choice. The old shared v1 key is deliberately unused.
  return <ScopedHomeLocationProvider key={scope} scope={scope} guest={guest}>{children}</ScopedHomeLocationProvider>;
}

function ScopedHomeLocationProvider({ children, scope, guest }: { children: ReactNode; scope: string; guest: boolean }) {
  const station = useStationCastContext();
  const storage = `propulse-home-location-v2:${scope}`;
  const [choice, setChoice] = useState(() => { try { return parseHomeLocation(localStorage.getItem(storage)); } catch { return "station"; } });
  const choose = (value: string) => { const next = parseHomeLocation(value); setChoice(next); try { localStorage.setItem(storage, next); } catch { /* Session selection still works. */ } };
  const location: OperatingLocation | null = isValidGrid(choice) ? { id: "home-location", name: "Selected location", grid: choice.toUpperCase(), ...gridToLatLon(choice), type: "home", createdAt: "" } : choice === "global" || guest ? null : station.location;
  return <HomeLocationContext.Provider value={{ location, choice, choose, guest, station }}>{children}</HomeLocationContext.Provider>;
}
