import { createContext, useContext } from "react";
import type { ThemeId } from "@/lib/themes";
import {
  stationTokens,
  type StationDensity,
  type StationTokenStyle,
} from "./tokens";

export interface StationThemeContextValue {
  theme: ThemeId;
  density: StationDensity;
  tokens: StationTokenStyle;
}
const DEFAULT_CONTEXT: StationThemeContextValue = {
  theme: "dark",
  density: "comfortable",
  tokens: stationTokens("dark", "#ff6b35"),
};
export const StationThemeContext = createContext(DEFAULT_CONTEXT);
export const useStationTheme = () => useContext(StationThemeContext);

/** Legacy portals inherit the document unless a scoped provider is present. */
export function useOptionalStationTheme(): StationThemeContextValue | null {
  const value = useContext(StationThemeContext);
  return value === DEFAULT_CONTEXT ? null : value;
}
