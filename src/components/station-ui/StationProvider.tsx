import { useMemo, type HTMLAttributes } from "react";
import { getAccentPreset, getTheme, type ThemeId } from "@/lib/themes";
import { useThemeStore } from "@/stores/themeStore";
import { StationThemeContext } from "./context";
import { stationTokens, type StationDensity } from "./tokens";
import "./station-ui.css";

export interface StationProviderProps extends HTMLAttributes<HTMLDivElement> {
  theme?: ThemeId;
  accent?: string;
  density?: StationDensity;
}

/** Theme previews stay local. Omit overrides to follow the app's preferences. */
export function StationProvider({
  theme,
  accent,
  density = "comfortable",
  className = "",
  style,
  children,
  ...props
}: StationProviderProps) {
  const appTheme = useThemeStore((s) => s.themeId);
  const appAccent = useThemeStore((s) => s.accentId);
  const customPrimary = useThemeStore((s) => s.customPrimary);
  const resolvedTheme = getTheme(theme ?? appTheme).id;
  const resolvedAccent =
    accent ?? customPrimary ?? getAccentPreset(appAccent).primary;
  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      density,
      tokens: stationTokens(resolvedTheme, resolvedAccent),
    }),
    [resolvedTheme, resolvedAccent, density],
  );
  return (
    <StationThemeContext.Provider value={value}>
      <div
        {...props}
        className={`station-ui ${className}`}
        style={{ ...value.tokens, ...style }}
        data-station-theme={resolvedTheme}
        data-density={density}
      >
        {children}
      </div>
    </StationThemeContext.Provider>
  );
}
