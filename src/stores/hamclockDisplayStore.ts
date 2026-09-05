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
export interface HomeRegion {
  lat: number;
  lon: number;
  latitudeSpan: number;
  longitudeSpan: number;
}
interface HamClockDisplayState {
  textSize: TextScale | "inherit" | "200" | "250";
  smartScaling: boolean;
  hiddenPanels: HamClockPanelId[];
  mapContent: "activity" | "contacts" | "both";
  followRadio: boolean;
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
  smartScaling: true,
  hiddenPanels: [] as HamClockPanelId[],
};
const validPanels = new Set<string>(HAMCLOCK_PANELS.map(([id]) => id));

/** A display's choices survive reload without changing another tab's presentation. */
export const useHamClockDisplayStore = create<HamClockDisplayState>()(
  persist(
    (set) => ({
      ...defaults,
      mapContent: "activity",
      followRadio: false,
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
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({
        textSize,
        smartScaling,
        hiddenPanels,
        mapContent,
        followRadio,
      }) => ({ textSize, smartScaling, hiddenPanels, mapContent, followRadio }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HamClockDisplayState>;
        return {
          ...current,
          textSize: ["inherit", "sm", "md", "lg", "xl", "200", "250"].includes(
            p.textSize ?? "",
          )
            ? p.textSize!
            : "inherit",
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
        };
      },
    },
  ),
);
