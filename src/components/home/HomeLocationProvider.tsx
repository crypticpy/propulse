import { useState, type ReactNode } from "react";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import type { OperatingLocation } from "@/types/user";
import { HomeLocationContext, parseHomeLocation } from "@/hooks/useHomeLocation";
const STORAGE = "propulse-home-location-v1";
export function HomeLocationProvider({ children }: { children: ReactNode }) {
  const station = useStationCastContext();
  const authenticated = useAuthStore(selectIsAuthenticated);
  const guest = isSupabaseConfigured && !authenticated;
  const [choice, setChoice] = useState(() => { try { return parseHomeLocation(localStorage.getItem(STORAGE)); } catch { return "station"; } });
  const choose = (value: string) => { const next = parseHomeLocation(value); setChoice(next); try { localStorage.setItem(STORAGE, next); } catch { /* Session selection still works. */ } };
  const location: OperatingLocation | null = isValidGrid(choice) ? { id: "home-location", name: "Selected location", grid: choice.toUpperCase(), ...gridToLatLon(choice), type: "home", createdAt: "" } : choice === "global" || guest ? null : station.location;
  return <HomeLocationContext.Provider value={{ location, choice, choose, guest, station }}>{children}</HomeLocationContext.Provider>;
}
