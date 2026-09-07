import { useMemo, type HTMLAttributes } from "react";
import { getAccentPreset, getTheme, type ThemeId } from "@/lib/themes";
import { useThemeStore } from "@/stores/themeStore";
import { useColorBlindMode } from "@/stores/settingsStore";
import { StationThemeContext } from "./context";
import {
  stationTokens,
  type StationDensity,
  type StationTextSize,
} from "./tokens";
import "./station-ui.css";

export interface StationProviderProps extends HTMLAttributes<HTMLDivElement> {
  theme?: ThemeId;
  accent?: string;
  density?: StationDensity;
  textSize?: StationTextSize;
}

/** Theme previews stay local. Omit overrides to follow the app's preferences. */
export function StationProvider({
  theme,
  accent,
  density = "comfortable",
  textSize = "standard",
  className = "",
  style,
  children,
  ...props
}: StationProviderProps) {
  const appTheme = useThemeStore((s) => s.themeId);
  const appAccent = useThemeStore((s) => s.accentId);
  const customPrimary = useThemeStore((s) => s.customPrimary);
  const customSecondary = useThemeStore((s) => s.customSecondary);
  // The tone tokens follow colour-blind mode here as well as on the document
  // root, so a scoped subtree never disagrees with the rest of the page.
  const colorBlindMode = useColorBlindMode();
  const resolvedTheme = getTheme(theme ?? appTheme).id;
  const resolvedAccent =
    accent ??
    (customPrimary && customSecondary
      ? customPrimary
      : getAccentPreset(appAccent).primary);
  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      density,
      tokens: {
        ...stationTokens(resolvedTheme, resolvedAccent, colorBlindMode),
        "--su-text-scale": String(
          { standard: 1, large: 1.125, "extra-large": 1.25 }[textSize],
        ),
      },
    }),
    [resolvedTheme, resolvedAccent, colorBlindMode, density, textSize],
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
