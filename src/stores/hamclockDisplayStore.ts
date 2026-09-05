import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TextScale } from "@/types/user";

export const HAMCLOCK_PANELS = [
  ["best", "Best Band Now"],
  ["de", "DE Station"],
  ["dx", "DX Target"],
  ["spacewx", "Space Weather"],
  ["moon", "Moon"],
  ["bands", "Band Conditions"],
  ["reliability", "24h Reliability"],
  ["dxpeditions", "DXpeditions"],
  ["contests", "Contests"],
  ["spots", "DX Spots"],
  ["contacts", "Recent Contacts"],
] as const;
export type HamClockPanelId = (typeof HAMCLOCK_PANELS)[number][0];

/** Wall = full-bleed map with tile rails; desk = the accordion layout. */
export type HamClockDensity = "wall" | "desk";
export type HamClockTheme = "pulse" | "classic" | "brass";
export type HamClockUnits = "imperial" | "metric" | "auto";
export type HamClockRailSide = "left" | "right";
export const HAMCLOCK_DENSITIES: readonly HamClockDensity[] = ["wall", "desk"];
export const HAMCLOCK_THEMES: readonly HamClockTheme[] = [
  "pulse",
  "classic",
  "brass",
];
export const HAMCLOCK_UNITS: readonly HamClockUnits[] = [
  "auto",
  "imperial",
  "metric",
];
export interface HomeRegion {
  lat: number;
  lon: number;
  latitudeSpan: number;
  longitudeSpan: number;
}
interface HamClockDisplayState {
  textSize: TextScale | "inherit" | "200" | "250";
  density: HamClockDensity;
  theme: HamClockTheme;
  units: HamClockUnits;
  /** Rails page independently, so each side keeps its own index. */
  pageIndex: Record<HamClockRailSide, number>;
  setDensity: (value: HamClockDensity) => void;
  setTheme: (value: HamClockTheme) => void;
  setUnits: (value: HamClockUnits) => void;
  setPage: (side: HamClockRailSide, index: number) => void;
  stepPage: (
    side: HamClockRailSide,
    delta: number,
    pageCount: number,
  ) => void;
  smartScaling: boolean;
  hiddenPanels: HamClockPanelId[];
  mapContent: "activity" | "contacts" | "both";
  followRadio: boolean;
  panelCollapsed: Partial<Record<HamClockPanelId, boolean>>;
  spotsSide: "left" | "right";
  spotsSidebarCollapsed: boolean;
  infoSidebarCollapsed: boolean;
  togglePanelExpansion: (
    id: HamClockPanelId,
    defaultCollapsed?: boolean,
  ) => void;
  setSpotsSide: (side: "left" | "right") => void;
  toggleSpotsSidebar: () => void;
  toggleInfoSidebar: () => void;
  homeRequest: (HomeRegion & { revision: number }) | null;
  setTextSize: (value: HamClockDisplayState["textSize"]) => void;
  setSmartScaling: (value: boolean) => void;
  togglePanel: (id: HamClockPanelId) => void;
  setMapContent: (value: HamClockDisplayState["mapContent"]) => void;
  setFollowRadio: (value: boolean) => void;
  frameHome: (region: HomeRegion) => void;
  resetDisplay: () => void;
}
const defaults = {
  textSize: "inherit" as const,
  // Desk stays the default until the wall tiles land (flipped in the next PR).
  density: "desk" as const,
  theme: "pulse" as const,
  units: "auto" as const,
  pageIndex: { left: 0, right: 0 } as Record<HamClockRailSide, number>,
  smartScaling: true,
  hiddenPanels: [] as HamClockPanelId[],
  mapContent: "activity" as const,
  followRadio: false,
  panelCollapsed: {} as Partial<Record<HamClockPanelId, boolean>>,
  spotsSide: "right" as const,
  spotsSidebarCollapsed: false,
  infoSidebarCollapsed: false,
};
const validPanels = new Set<string>(HAMCLOCK_PANELS.map(([id]) => id));

function pageOrZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

/** A display's choices survive reload without changing another tab's presentation. */
export const useHamClockDisplayStore = create<HamClockDisplayState>()(
  persist(
    (set) => ({
      ...defaults,
      togglePanelExpansion: (id, defaultCollapsed = false) =>
        set((s) => ({
          panelCollapsed: {
            ...s.panelCollapsed,
            [id]: !(s.panelCollapsed[id] ?? defaultCollapsed),
          },
        })),
      setDensity: (density) => set({ density }),
      setTheme: (theme) => set({ theme }),
      setUnits: (units) => set({ units }),
      setPage: (side, index) =>
        set((s) => ({ pageIndex: { ...s.pageIndex, [side]: index } })),
      stepPage: (side, delta, pageCount) =>
        set((s) => {
          if (pageCount < 1) return {};
          const next =
            (((s.pageIndex[side] + delta) % pageCount) + pageCount) % pageCount;
          return { pageIndex: { ...s.pageIndex, [side]: next } };
        }),
      setSpotsSide: (spotsSide) => set({ spotsSide }),
      toggleSpotsSidebar: () =>
        set((s) => ({ spotsSidebarCollapsed: !s.spotsSidebarCollapsed })),
      toggleInfoSidebar: () =>
        set((s) => ({ infoSidebarCollapsed: !s.infoSidebarCollapsed })),
      homeRequest: null,
      setTextSize: (textSize) => set({ textSize }),
      setSmartScaling: (smartScaling) => set({ smartScaling }),
      togglePanel: (id) =>
        set((s) => ({
          hiddenPanels: s.hiddenPanels.includes(id)
            ? s.hiddenPanels.filter((p) => p !== id)
            : [...s.hiddenPanels, id],
        })),
      setMapContent: (mapContent) => set({ mapContent }),
      setFollowRadio: (followRadio) => set({ followRadio }),
      frameHome: (region) =>
        set((s) => ({
          homeRequest: {
            ...region,
            revision: (s.homeRequest?.revision ?? 0) + 1,
          },
        })),
      resetDisplay: () => set({ ...defaults }),
    }),
    {
      name: "propulse-hamclock-display",
      version: 2,
      storage: createJSONStorage(() => sessionStorage),
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // Desk density, pulse theme, automatic units and page 0 per rail.
          state.density = defaults.density;
          state.theme = defaults.theme;
          state.units = defaults.units;
          state.pageIndex = { ...defaults.pageIndex };
        }
        return state as unknown as HamClockDisplayState;
      },
      partialize: ({
        textSize,
        density,
        theme,
        units,
        pageIndex,
        smartScaling,
        hiddenPanels,
        mapContent,
        followRadio,
        panelCollapsed,
        spotsSide,
        spotsSidebarCollapsed,
        infoSidebarCollapsed,
      }) => ({
        textSize,
        density,
        theme,
        units,
        pageIndex,
        smartScaling,
        hiddenPanels,
        mapContent,
        followRadio,
        panelCollapsed,
        spotsSide,
        spotsSidebarCollapsed,
        infoSidebarCollapsed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HamClockDisplayState>;
        return {
          ...current,
          textSize: ["inherit", "sm", "md", "lg", "xl", "200", "250"].includes(
            p.textSize ?? "",
          )
            ? p.textSize!
            : "inherit",
          density: p.density === "wall" ? "wall" : "desk",
          theme: HAMCLOCK_THEMES.includes(p.theme as HamClockTheme)
            ? (p.theme as HamClockTheme)
            : "pulse",
          units: HAMCLOCK_UNITS.includes(p.units as HamClockUnits)
            ? (p.units as HamClockUnits)
            : "auto",
          pageIndex: {
            left: pageOrZero(p.pageIndex?.left),
            right: pageOrZero(p.pageIndex?.right),
          },
          smartScaling:
            typeof p.smartScaling === "boolean" ? p.smartScaling : true,
          hiddenPanels: Array.isArray(p.hiddenPanels)
            ? p.hiddenPanels.filter((id) => validPanels.has(id))
            : [],
          mapContent: ["activity", "contacts", "both"].includes(
            p.mapContent ?? "",
          )
            ? p.mapContent!
            : "activity",
          followRadio: p.followRadio === true,
          panelCollapsed:
            p.panelCollapsed && typeof p.panelCollapsed === "object"
              ? Object.fromEntries(
                  Object.entries(p.panelCollapsed).filter(
                    ([id, value]) =>
                      validPanels.has(id) && typeof value === "boolean",
                  ),
                )
              : {},
          spotsSide: p.spotsSide === "left" ? "left" : "right",
          spotsSidebarCollapsed: p.spotsSidebarCollapsed === true,
          infoSidebarCollapsed: p.infoSidebarCollapsed === true,
        };
      },
    },
  ),
);
