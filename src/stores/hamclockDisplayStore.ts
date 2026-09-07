import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  findDuplicateTile,
  pageTitle,
  WALL_PAGES,
  WALL_TILE_IDS,
  type PageTileSlots,
} from "@/lib/hamclock/wallPages";
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

/* ---------------------------------------------------------------------- */
/* User-selected rails, presets, no radio dependency (wall spec §6/§7, B4) */
/* ---------------------------------------------------------------------- */

/** One rail's tile assignment for one page. Kept as plain strings, not
 * `TileId`, for the same reason `PageTileSlots` is: this store has no
 * compile-time dependency on the wall component tree. */
export interface RailPage {
  pageId: string;
  tileIds: string[];
}
export type RailLayout = Record<HamClockRailSide, RailPage[]>;

export interface HamClockAutoPage {
  enabled: boolean;
  dwellSeconds: number;
}

export interface HamClockPreset {
  id: string;
  name: string;
  layout: RailLayout;
  autoPage: HamClockAutoPage;
}

export interface PinnedTile {
  side: HamClockRailSide;
  tileId: string;
}

/**
 * The page/tile ids the wall ships as of this batch, used only to drop stale
 * references from a persisted `railLayout` once a tile or page retires (wall
 * spec §6: "unknown tileIds ... are dropped at read time"). Derived from the
 * leaf module's catalogue (`@/lib/hamclock/wallPages`) rather than
 * hand-copied, so this set cannot drift from the shipped pages by
 * construction.
 */
const KNOWN_PAGE_IDS = new Set(WALL_PAGES.map((page) => page.id));
const KNOWN_TILE_IDS = new Set(WALL_TILE_IDS);

/**
 * The shipped composition, derived from the same leaf-module catalogue
 * `KNOWN_PAGE_IDS`/`KNOWN_TILE_IDS` read above, in this store's
 * dependency-free `RailLayout` shape. Seeds every pre-B4 session's
 * `railLayout` on migration and is the read-time fallback for a persisted
 * layout that is missing, corrupt, or emptied by the unknown-id cleanup
 * below.
 */
const SHIPPED_RAIL_LAYOUT: RailLayout = {
  left: WALL_PAGES.map((page) => ({
    pageId: page.id,
    tileIds: [...page.left],
  })),
  right: WALL_PAGES.map((page) => ({
    pageId: page.id,
    tileIds: [...page.right],
  })),
};

function cloneRailLayout(layout: RailLayout): RailLayout {
  return {
    left: layout.left.map((page) => ({ ...page, tileIds: [...page.tileIds] })),
    right: layout.right.map((page) => ({
      ...page,
      tileIds: [...page.tileIds],
    })),
  };
}

/**
 * The page ids a layout cycles through, in pager order: every id the left
 * rail names, in its order, followed by any id only the right rail names.
 * Both rails share one page index (wall spec §4/§5), so this is the one
 * ordering a kiosk pin (`applySceneToMap`) or the footer pager resolves a
 * page id against.
 */
export function railLayoutPageIds(layout: RailLayout): string[] {
  const order: string[] = [];
  for (const page of layout.left) {
    if (!order.includes(page.pageId)) order.push(page.pageId);
  }
  for (const page of layout.right) {
    if (!order.includes(page.pageId)) order.push(page.pageId);
  }
  return order;
}

/**
 * Converts a rail-keyed `RailLayout` into the page-keyed `PageTileSlots[]`
 * shape `findDuplicateTile` checks, matching a page's left assignment with
 * its right by `pageId` — "one tile, one place per page" (wall spec §2)
 * applies to a user's own layout exactly like it applies to the shipped
 * pages.
 */
export function railLayoutPageSlots(layout: RailLayout): PageTileSlots[] {
  const left = new Map<string, readonly string[]>(
    layout.left.map((page) => [page.pageId, page.tileIds]),
  );
  const right = new Map<string, readonly string[]>(
    layout.right.map((page) => [page.pageId, page.tileIds]),
  );
  return railLayoutPageIds(layout).map((pageId) => ({
    left: left.get(pageId) ?? [],
    right: right.get(pageId) ?? [],
  }));
}

/**
 * The pages a layout actually cycles through, in pager order, with each
 * catalog title attached (wall spec §4/§5, review pass after B4): a preset
 * that places one page on the rails shows that one page in the footer pager
 * and both rails, not the fixed five-page catalogue regardless of what the
 * chosen layout actually contains. Builds on `railLayoutPageIds`, the
 * existing left-then-right-only ordering, so a page named only on the right
 * rail is still shown rather than dropped.
 */
export function wallPages(layout: RailLayout): { id: string; title: string }[] {
  return railLayoutPageIds(layout).map((id) => ({ id, title: pageTitle(id) }));
}

/**
 * Clamps a page index into `[0, count - 1]` (or 0 when `count` is less than
 * 1). A layout change — a preset switch, a rail edit that drops a page —
 * must never leave `pageIndex` pointing past the end of the pages that
 * remain, so every write site that replaces `railLayout` re-clamps through
 * this instead of trusting the previous index still fits.
 */
export function clampPageIndex(index: number, count: number): number {
  if (count < 1) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

function isRailPageShape(
  value: unknown,
): value is { pageId: unknown; tileIds: unknown } {
  return typeof value === "object" && value !== null && "pageId" in value;
}

/**
 * Migration helper: when `side`/`pageId` in a persisted layout still holds
 * exactly `previousShipped`, replace it with the current shipped tiles for
 * that page. Any other content (customised, missing, malformed) is returned
 * untouched; `sanitizeRailLayout` deals with malformed shapes later.
 */
export function adoptShippedRailPage(
  layout: unknown,
  side: HamClockRailSide,
  pageId: string,
  previousShipped: readonly string[],
): unknown {
  if (typeof layout !== "object" || layout === null) return layout;
  const raw = layout as Record<string, unknown>;
  if (!Array.isArray(raw[side])) return layout;
  const shipped = SHIPPED_RAIL_LAYOUT[side].find((p) => p.pageId === pageId);
  if (!shipped) return layout;
  const pages = (raw[side] as unknown[]).map((entry) => {
    if (!isRailPageShape(entry) || entry.pageId !== pageId) return entry;
    const ids = entry.tileIds;
    const unchanged =
      Array.isArray(ids) &&
      ids.length === previousShipped.length &&
      ids.every((id, i) => id === previousShipped[i]);
    return unchanged ? { pageId, tileIds: [...shipped.tileIds] } : entry;
  });
  return { ...raw, [side]: pages };
}

/**
 * Read-time cleanup for a persisted `railLayout` (wall spec §6): drops tile
 * ids the wall no longer ships and pages that no longer exist, then falls
 * back to the shipped composition for any side (or the whole layout, if a
 * hand-edited payload still has a duplicate after cleanup) that would
 * otherwise leave the pager with nothing to show.
 */
export function sanitizeRailLayout(value: unknown): RailLayout {
  if (typeof value !== "object" || value === null) {
    return cloneRailLayout(SHIPPED_RAIL_LAYOUT);
  }
  const raw = value as Record<string, unknown>;
  const cleaned = { left: [], right: [] } as unknown as RailLayout;
  for (const side of ["left", "right"] as const) {
    const list = Array.isArray(raw[side]) ? (raw[side] as unknown[]) : [];
    const pages: RailPage[] = [];
    for (const entry of list) {
      if (!isRailPageShape(entry)) continue;
      const { pageId, tileIds } = entry;
      if (typeof pageId !== "string" || !KNOWN_PAGE_IDS.has(pageId)) continue;
      if (!Array.isArray(tileIds)) continue;
      pages.push({
        pageId,
        tileIds: tileIds.filter(
          (id): id is string =>
            typeof id === "string" && KNOWN_TILE_IDS.has(id),
        ),
      });
    }
    cleaned[side] =
      pages.length > 0
        ? pages
        : SHIPPED_RAIL_LAYOUT[side].map((page) => ({
            ...page,
            tileIds: [...page.tileIds],
          }));
  }
  return findDuplicateTile(railLayoutPageSlots(cleaned))
    ? cloneRailLayout(SHIPPED_RAIL_LAYOUT)
    : cleaned;
}

function isValidAutoPage(value: unknown): value is HamClockAutoPage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.enabled === "boolean" &&
    typeof candidate.dwellSeconds === "number" &&
    Number.isFinite(candidate.dwellSeconds) &&
    candidate.dwellSeconds > 0
  );
}

function isValidPinnedTile(value: unknown): value is PinnedTile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.side === "left" || candidate.side === "right") &&
    typeof candidate.tileId === "string" &&
    KNOWN_TILE_IDS.has(candidate.tileId)
  );
}

/** User-saved presets (shipped presets live in `wall/presets.ts` and are
 * never persisted here). A malformed entry is dropped rather than
 * discarding the whole list. */
function sanitizePresets(value: unknown): HamClockPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: HamClockPreset[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || candidate.id.trim() === "")
      continue;
    if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
      continue;
    }
    if (!isValidAutoPage(candidate.autoPage)) continue;
    presets.push({
      id: candidate.id,
      name: candidate.name,
      layout: sanitizeRailLayout(candidate.layout),
      autoPage: candidate.autoPage,
    });
  }
  return presets;
}

const DEFAULT_AUTO_PAGE: HamClockAutoPage = { enabled: true, dwellSeconds: 30 };

interface HamClockDisplayState {
  textSize: TextScale | "inherit" | "200" | "250";
  density: HamClockDensity;
  theme: HamClockTheme;
  units: HamClockUnits;
  /**
   * The page is one concept shared by both rails (wall spec §4/§5): `left`
   * is canonical and `right` always mirrors it. Kept as a per-side record
   * only so the persisted shape doesn't need a migration — `setPage`/
   * `stepPage` always write both keys together, and `merge` collapses any
   * stale persisted divergence back onto `left` on read.
   */
  pageIndex: Record<HamClockRailSide, number>;
  setDensity: (value: HamClockDensity) => void;
  setTheme: (value: HamClockTheme) => void;
  setUnits: (value: HamClockUnits) => void;
  setPage: (side: HamClockRailSide, index: number) => void;
  stepPage: (side: HamClockRailSide, delta: number, pageCount: number) => void;
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
  /** Which tiles each rail shows on each page (wall spec §6). */
  railLayout: RailLayout;
  /** One tile pinned to the top of a rail across every page (§6).
   * `HamClockRail` already renders it when set, but `PagesTilesTab` has no
   * control to set it yet — a later batch adds the picker's pin control. */
  pinnedTile?: PinnedTile;
  /** The operator's own saved layouts (§7); shipped presets are static data
   * in `wall/presets.ts`, never persisted here. */
  presets: HamClockPreset[];
  autoPage: HamClockAutoPage;
  /** Rejects (returns `false`, keeps the previous layout) a layout that
   * places the same tile twice on one page, on either rail (HW-50). */
  setRailLayout: (layout: RailLayout) => boolean;
  resetRailLayout: () => void;
  setPinnedTile: (pin: PinnedTile | undefined) => void;
  setAutoPage: (autoPage: HamClockAutoPage) => void;
  /** Saves the current `railLayout` and `autoPage` as a new user preset and
   * returns it. */
  savePreset: (name: string) => HamClockPreset;
  deletePreset: (id: string) => void;
  /** Replaces `railLayout` and `autoPage` together, as choosing a preset
   * does (§7). Rejects (returns `false`) the same way `setRailLayout` does. */
  applyLayoutPreset: (
    layout: RailLayout,
    autoPage: HamClockAutoPage,
  ) => boolean;
}
const defaults = {
  textSize: "inherit" as const,
  // Wall is the shipped default; desk stays one click away in the footer.
  density: "wall" as const,
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
  railLayout: cloneRailLayout(SHIPPED_RAIL_LAYOUT),
  pinnedTile: undefined as PinnedTile | undefined,
  presets: [] as HamClockPreset[],
  autoPage: { ...DEFAULT_AUTO_PAGE },
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
    (set, get) => ({
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
      // `side` stays in the signature so every existing caller (arrow keys,
      // the footer pagers, kiosk scene pins) keeps compiling, but both rails
      // always follow the same page: a set/step on either side writes the
      // resulting index to both keys.
      setPage: (_side, index) =>
        set(() => ({ pageIndex: { left: index, right: index } })),
      stepPage: (_side, delta, pageCount) =>
        set((s) => {
          if (pageCount < 1) return {};
          const next =
            (((s.pageIndex.left + delta) % pageCount) + pageCount) % pageCount;
          return { pageIndex: { left: next, right: next } };
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
      setRailLayout: (layout) => {
        if (findDuplicateTile(railLayoutPageSlots(layout))) return false;
        const railLayout = cloneRailLayout(layout);
        const pageCount = wallPages(railLayout).length;
        set((s) => ({
          railLayout,
          pageIndex: {
            left: clampPageIndex(s.pageIndex.left, pageCount),
            right: clampPageIndex(s.pageIndex.right, pageCount),
          },
        }));
        return true;
      },
      resetRailLayout: () => {
        const railLayout = cloneRailLayout(SHIPPED_RAIL_LAYOUT);
        const pageCount = wallPages(railLayout).length;
        set((s) => ({
          railLayout,
          pageIndex: {
            left: clampPageIndex(s.pageIndex.left, pageCount),
            right: clampPageIndex(s.pageIndex.right, pageCount),
          },
        }));
      },
      setPinnedTile: (pinnedTile) => set({ pinnedTile }),
      setAutoPage: (autoPage) => set({ autoPage }),
      savePreset: (name) => {
        const state = get();
        const preset: HamClockPreset = {
          id: `user-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          name,
          layout: cloneRailLayout(state.railLayout),
          autoPage: { ...state.autoPage },
        };
        set((s) => ({ presets: [...s.presets, preset] }));
        return preset;
      },
      deletePreset: (id) =>
        set((s) => ({
          presets: s.presets.filter((preset) => preset.id !== id),
        })),
      applyLayoutPreset: (layout, autoPage) => {
        if (findDuplicateTile(railLayoutPageSlots(layout))) return false;
        const railLayout = cloneRailLayout(layout);
        const pageCount = wallPages(railLayout).length;
        set((s) => ({
          railLayout,
          autoPage: { ...autoPage },
          pageIndex: {
            left: clampPageIndex(s.pageIndex.left, pageCount),
            right: clampPageIndex(s.pageIndex.right, pageCount),
          },
        }));
        return true;
      },
    }),
    {
      name: "propulse-hamclock-display",
      version: 7,
      storage: createJSONStorage(() => sessionStorage),
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // Pulse theme, automatic units and page 0 per rail.
          state.theme = defaults.theme;
          state.units = defaults.units;
          state.pageIndex = { ...defaults.pageIndex };
        }
        if (version < 3) {
          // The wall tiles have landed, so every pre-wall session adopts the
          // new default rather than staying on the accordion it never chose.
          state.density = "wall";
        }
        if (version < 4) {
          // Rails, presets and auto-page are new fields (wall spec §6/§7):
          // every pre-B4 session seeds the shipped composition rather than
          // starting with nothing to show.
          state.railLayout = cloneRailLayout(SHIPPED_RAIL_LAYOUT);
          state.pinnedTile = undefined;
          state.presets = [];
          state.autoPage = { ...DEFAULT_AUTO_PAGE };
        }
        if (version < 5) {
          // B8 added the DX target tile to the shipped Spots left rail. A
          // session still on the pre-B8 shipped composition adopts the new
          // one; a rail the operator rearranged is left exactly as it is.
          state.railLayout = adoptShippedRailPage(
            state.railLayout,
            "left",
            "spots",
            ["cluster", "bandActivity", "recentContacts"],
          );
        }
        if (version < 6) {
          state.railLayout = adoptShippedRailPage(
            state.railLayout, "right", "spots",
            ["bestBand", "greyLine", "muf", "reliability", "emcomm"],
          );
        }
        if (version < 7) {
          state.railLayout = adoptShippedRailPage(state.railLayout, "left", "sdr", ["sdrScope", "sdrDecodes"]);
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
        railLayout,
        pinnedTile,
        presets,
        autoPage,
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
        railLayout,
        pinnedTile,
        presets,
        autoPage,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HamClockDisplayState>;
        const railLayout = sanitizeRailLayout(p.railLayout);
        const pageCount = wallPages(railLayout).length;
        return {
          ...current,
          textSize: ["inherit", "sm", "md", "lg", "xl", "200", "250"].includes(
            p.textSize ?? "",
          )
            ? p.textSize!
            : "inherit",
          density: HAMCLOCK_DENSITIES.includes(p.density as HamClockDensity)
            ? (p.density as HamClockDensity)
            : defaults.density,
          theme: HAMCLOCK_THEMES.includes(p.theme as HamClockTheme)
            ? (p.theme as HamClockTheme)
            : "pulse",
          units: HAMCLOCK_UNITS.includes(p.units as HamClockUnits)
            ? (p.units as HamClockUnits)
            : "auto",
          // Both rails follow one page: a stale session from before paging
          // was synchronized (or a kiosk pin that set the two keys apart)
          // collapses onto the left value here rather than staying split.
          // Also re-clamped against the rehydrated `railLayout`'s own page
          // count, so a session saved against a bigger layout never resumes
          // pointing past the end of a smaller one (review pass after B4).
          pageIndex: {
            left: clampPageIndex(pageOrZero(p.pageIndex?.left), pageCount),
            right: clampPageIndex(pageOrZero(p.pageIndex?.left), pageCount),
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
          railLayout,
          pinnedTile: isValidPinnedTile(p.pinnedTile)
            ? p.pinnedTile
            : undefined,
          presets: sanitizePresets(p.presets),
          autoPage: isValidAutoPage(p.autoPage)
            ? p.autoPage
            : { ...DEFAULT_AUTO_PAGE },
        };
      },
    },
  ),
);
