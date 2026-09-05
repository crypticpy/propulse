import { createContext, useContext } from "react";
import type { useStationCastContext } from "@/hooks/useStationCastContext";
import type { OperatingLocation } from "@/types/user";
import { isValidGrid } from "@/lib/utils/grid";
export function parseHomeLocation(value: string | null): string {
  return value === "global" || (value !== null && (value.length === 4 || value.length === 6) && isValidGrid(value)) ? value! : "station";
}
export const HomeLocationContext = createContext<{ location: OperatingLocation | null; choice: string; choose: (value: string) => void; guest: boolean; station: ReturnType<typeof useStationCastContext> } | null>(null);
export function useHomeLocation() {
  const value = useContext(HomeLocationContext);
  if (!value) throw new Error("Home location provider required");
  return value;
}
