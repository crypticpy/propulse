import { afterEach, describe, expect, it } from "vitest";
import { useThemeStore } from "./themeStore";

const STORAGE_KEY = "propulse-theme";

function resetThemeStore() {
  const store = useThemeStore.getState();
  store.setTheme("dark");
  store.setAccent("plasma");
  store.setSaturation(1);
}

describe("themeStore saturation", () => {
  afterEach(() => {
    resetThemeStore();
  });

  it("defaults to 1 when the persisted blob has no saturation key", () => {
    expect(useThemeStore.getState().saturation).toBe(1);
  });

  it("snaps, clamps, and persists the factor", () => {
    useThemeStore.getState().setSaturation(1.37);
    expect(useThemeStore.getState().saturation).toBe(1.35);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saturation).toBe(1.35);

    useThemeStore.getState().setSaturation(2);
    expect(useThemeStore.getState().saturation).toBe(1.4);
    useThemeStore.getState().setSaturation(0.1);
    expect(useThemeStore.getState().saturation).toBe(0.8);
  });

  it("keeps saturation when the theme or accent changes", () => {
    useThemeStore.getState().setSaturation(1.2);
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().setAccent("aurora");
    expect(useThemeStore.getState().saturation).toBe(1.2);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      themeId: "light",
      accentId: "aurora",
      saturation: 1.2,
    });
  });
});
