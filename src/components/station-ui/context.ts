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
export const StationThemeContext = createContext<StationThemeContextValue>({
  theme: "dark",
  density: "comfortable",
  tokens: stationTokens("dark", "#ff6b35"),
});
export const useStationTheme = () => useContext(StationThemeContext);
