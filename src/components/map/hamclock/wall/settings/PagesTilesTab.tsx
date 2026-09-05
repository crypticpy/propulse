import { useState } from "react";
import { ensureHamClockThemeFont } from "@/lib/hamclock/themeFonts";
import type { RegisteredWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import { useWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import {
  railLayoutPageIds,
  useHamClockDisplayStore,
  type HamClockDensity,
  type HamClockRailSide,
  type RailLayout,
} from "@/stores/hamclockDisplayStore";
import { HAMCLOCK_WALL_PAGES } from "../pages";
import { WALL_PRESETS, type WallPreset } from "../presets";
import { WALL_TILES, type TileId } from "../tiles";
import {
  HamClockButton,
  HamClockDialog,
  HamClockSegmented,
  HamClockToggleRow,
} from "../controls";

/** How many tiles one rail can carry before the picker refuses to add
 * another (wall spec §3/§8: wall 4 left / 5 right, desk 5 left / 6 right). */
const SLOT_LIMITS: Record<HamClockDensity, Record<HamClockRailSide, number>> = {
  wall: { left: 4, right: 5 },
  desk: { left: 5, right: 6 },
};

/** Tile cards fitting on one page before it needs PREV/NEXT paging — nothing
 * in the wall scrolls, so a list past this size is cut into pages instead. */
const TILES_PER_PAGE = 8;

const ALL_TILE_IDS = Object.keys(WALL_TILES) as TileId[];

const PAGE_OPTIONS = HAMCLOCK_WALL_PAGES.map((page) => ({
  value: page.id,
  label: page.title.toUpperCase(),
}));

const SIDE_OPTIONS: { value: HamClockRailSide; label: string }[] = [
  { value: "left", label: "LEFT RAIL" },
  { value: "right", label: "RIGHT RAIL" },
];

function otherSideOf(side: HamClockRailSide): HamClockRailSide {
  return side === "left" ? "right" : "left";
}

function getSlotTileIds(
  layout: RailLayout,
  pageId: string,
  side: HamClockRailSide,
): TileId[] {
  return (layout[side].find((page) => page.pageId === pageId)?.tileIds ??
    []) as TileId[];
}

function withSlotTileIds(
  layout: RailLayout,
  pageId: string,
  side: HamClockRailSide,
  tileIds: TileId[],
): RailLayout {
  const pages = layout[side];
  const exists = pages.some((page) => page.pageId === pageId);
  return {
    ...layout,
    [side]: exists
      ? pages.map((page) =>
          page.pageId === pageId ? { ...page, tileIds } : page,
        )
      : [...pages, { pageId, tileIds }],
  };
}

/** The generic panel host: reads/writes any tile's config at the `unknown`
 * level the registry stores it at. `RegisteredWidgetConfig` is structurally
 * identical to `WidgetConfig<unknown>` (guide §9's erasure), so this is the
 * one place a tile's config is edited without the caller knowing its
 * specific `T` — every other config surface (the tile itself) imports its
 * concrete schema/defaults/panel directly instead. */
function TileConfigDialog({
  tileId,
  title,
  config,
  open,
  onClose,
}: {
  tileId: TileId;
  title: string;
  config: RegisteredWidgetConfig;
  open: boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useWidgetConfig<unknown>(tileId, config);
  const ConfigPanel = config.ConfigPanel;
  return (
    <HamClockDialog open={open} onClose={onClose} title={title} size="config">
      <ConfigPanel value={value} onChange={setValue} />
    </HamClockDialog>
  );
}

/** Carried over from B5 unchanged: a tile that registers a config (only
 * `recentContacts` today, guide §9) gets an OPTIONS button that opens its
 * panel in a dialog, regardless of whether the tile is currently placed on
 * this page/rail — the config it edits (e.g. row count) applies everywhere
 * the tile is placed, not just here. */
function TileOptionsGear({ id }: { id: TileId }) {
  const tile = WALL_TILES[id];
  const [open, setOpen] = useState(false);
  if (!tile.config) return null;
  return (
    <>
      <HamClockButton
        aria-label={`${tile.title} options`}
        onClick={() => setOpen(true)}
      >
        OPTIONS
      </HamClockButton>
      <TileConfigDialog
        tileId={id}
        title={tile.title.toUpperCase()}
        config={tile.config}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/**
 * Preset cards (wall spec §7): choosing one replaces `railLayout` and
 * `autoPage` immediately. The suggested theme is never applied with it — a
 * `WallPreset` carries one, but switching it is a separate confirm the
 * parent renders (`ThemeOfferBanner`) so a preset never silently changes the
 * look an operator already chose.
 */
function PresetCards({
  onThemeOffer,
}: {
  onThemeOffer: (preset: WallPreset) => void;
}) {
  const applyLayoutPreset = useHamClockDisplayStore(
    (s) => s.applyLayoutPreset,
  );
  const theme = useHamClockDisplayStore((s) => s.theme);

  return (
    <div className="hcc-presets">
      {WALL_PRESETS.map((preset) => {
        const pageCount = railLayoutPageIds(preset.layout).length;
        return (
          <div className="hcc-preset-card" key={preset.id}>
            <p className="hcc-preset-card-name">{preset.name.toUpperCase()}</p>
            <p className="hcc-preset-card-note">
              {pageCount} page{pageCount === 1 ? "" : "s"} ·{" "}
              {preset.autoPage.enabled
                ? `auto-page ${preset.autoPage.dwellSeconds}s`
                : "no auto-page"}
            </p>
            <HamClockButton
              onClick={() => {
                applyLayoutPreset(preset.layout, preset.autoPage);
                if (preset.theme !== theme) onThemeOffer(preset);
              }}
            >
              USE THIS PRESET
            </HamClockButton>
          </div>
        );
      })}
    </div>
  );
}

/** The suggested theme is offered, never forced (wall spec §7): this banner
 * only appears once, right after a preset is chosen whose suggested theme
 * differs from the active one, and either choice dismisses it. */
function ThemeOfferBanner({
  preset,
  onDismiss,
}: {
  preset: WallPreset;
  onDismiss: () => void;
}) {
  const setTheme = useHamClockDisplayStore((s) => s.setTheme);
  return (
    <div className="hcc-theme-offer">
      <span className="hcc-theme-offer-text">
        {preset.name} suggests the {preset.theme.toUpperCase()} theme.
      </span>
      <div className="hcc-theme-offer-actions">
        <HamClockButton
          variant="primary"
          onClick={() => {
            ensureHamClockThemeFont(preset.theme);
            setTheme(preset.theme);
            onDismiss();
          }}
        >
          SWITCH THEME
        </HamClockButton>
        <HamClockButton onClick={onDismiss}>
          KEEP CURRENT THEME
        </HamClockButton>
      </div>
    </div>
  );
}

interface SlotEditorProps {
  pageId: string;
  side: HamClockRailSide;
  onPageChange: (pageId: string) => void;
  onSideChange: (side: HamClockRailSide) => void;
}

/**
 * The picker itself (wall spec §6): a page + rail choice, then every
 * registered tile as one big ON/OFF list for that slot. A tile already on
 * this page's other rail can't be added here too — "one tile, one place per
 * page" (HW-50) — so it shows disabled and names where it already is,
 * instead of letting an operator discover the rejection after the fact.
 */
function SlotEditor({
  pageId,
  side,
  onPageChange,
  onSideChange,
}: SlotEditorProps) {
  const railLayout = useHamClockDisplayStore((s) => s.railLayout);
  const setRailLayout = useHamClockDisplayStore((s) => s.setRailLayout);
  const density = useHamClockDisplayStore((s) => s.density);
  const [tilePage, setTilePage] = useState(0);

  const otherSide = otherSideOf(side);
  const placed = getSlotTileIds(railLayout, pageId, side);
  const otherSidePlaced = getSlotTileIds(railLayout, pageId, otherSide);
  const limit = SLOT_LIMITS[density][side];
  const atLimit = placed.length >= limit;

  function commit(next: TileId[]) {
    setRailLayout(withSlotTileIds(railLayout, pageId, side, next));
  }
  function addTile(id: TileId) {
    if (atLimit || placed.includes(id)) return;
    commit([...placed, id]);
  }
  function removeTile(id: TileId) {
    commit(placed.filter((existing) => existing !== id));
  }
  function moveTile(id: TileId, delta: number) {
    const index = placed.indexOf(id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= placed.length) return;
    const next = [...placed];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  const pageCount = Math.max(
    1,
    Math.ceil(ALL_TILE_IDS.length / TILES_PER_PAGE),
  );
  const clampedTilePage = Math.min(tilePage, pageCount - 1);
  const visibleIds = ALL_TILE_IDS.slice(
    clampedTilePage * TILES_PER_PAGE,
    clampedTilePage * TILES_PER_PAGE + TILES_PER_PAGE,
  );

  return (
    <div className="hcc-slot-editor">
      <div className="hcc-picker-row">
        <HamClockSegmented
          label="Page"
          value={pageId}
          onChange={onPageChange}
          options={PAGE_OPTIONS}
        />
        <HamClockSegmented
          label="Rail"
          value={side}
          onChange={onSideChange}
          options={SIDE_OPTIONS}
        />
      </div>

      <p className="hcc-slot-count">
        {placed.length} of {limit} used
      </p>

      <div className="hcc-tile-columns">
        {visibleIds.map((id) => {
          const tile = WALL_TILES[id];
          const checked = placed.includes(id);
          const onOtherSide = !checked && otherSidePlaced.includes(id);
          const disabled = onOtherSide || (!checked && atLimit);
          const detail = onOtherSide
            ? otherSide === "left"
              ? "ON LEFT RAIL"
              : "ON RIGHT RAIL"
            : !checked && atLimit
              ? "RAIL FULL"
              : undefined;
          const orderIndex = placed.indexOf(id);

          return (
            <HamClockToggleRow
              key={id}
              label={tile.title}
              detail={detail}
              checked={checked}
              disabled={disabled}
              onChange={(next) => (next ? addTile(id) : removeTile(id))}
              actions={
                <>
                  {checked && (
                    <>
                      <HamClockButton
                        aria-label={`Move ${tile.title} up`}
                        onClick={() => moveTile(id, -1)}
                        disabled={orderIndex === 0}
                      >
                        ▲
                      </HamClockButton>
                      <HamClockButton
                        aria-label={`Move ${tile.title} down`}
                        onClick={() => moveTile(id, 1)}
                        disabled={orderIndex === placed.length - 1}
                      >
                        ▼
                      </HamClockButton>
                    </>
                  )}
                  <TileOptionsGear id={id} />
                </>
              }
            />
          );
        })}
      </div>

      {pageCount > 1 && (
        <div className="hcc-pager-row">
          <HamClockButton
            onClick={() => setTilePage((p) => Math.max(0, p - 1))}
            disabled={clampedTilePage === 0}
          >
            PREV
          </HamClockButton>
          <span className="hcc-pager-n">
            {clampedTilePage + 1} / {pageCount}
          </span>
          <HamClockButton
            onClick={() =>
              setTilePage((p) => Math.min(pageCount - 1, p + 1))
            }
            disabled={clampedTilePage === pageCount - 1}
          >
            NEXT
          </HamClockButton>
        </div>
      )}
    </div>
  );
}

/** RESET TO SHIPPED LAYOUT and SAVE AS PRESET (wall spec §6/§7). The save
 * flow's inline text field is a deliberate exception to the wall's
 * no-typing-heavy-inputs bias — naming a preset has no other sane control. */
function ResetAndSaveRow() {
  const resetRailLayout = useHamClockDisplayStore((s) => s.resetRailLayout);
  const savePreset = useHamClockDisplayStore((s) => s.savePreset);
  const [draftName, setDraftName] = useState<string | null>(null);

  if (draftName !== null) {
    return (
      <div className="hcc-save-preset">
        <label className="hcc-save-preset-label" htmlFor="hcc-preset-name">
          Preset name
        </label>
        <input
          id="hcc-preset-name"
          className="hcc-input"
          type="text"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="My layout"
        />
        <HamClockButton
          variant="primary"
          disabled={draftName.trim().length === 0}
          onClick={() => {
            savePreset(draftName.trim());
            setDraftName(null);
          }}
        >
          SAVE
        </HamClockButton>
        <HamClockButton onClick={() => setDraftName(null)}>
          CANCEL
        </HamClockButton>
      </div>
    );
  }

  return (
    <div className="hcc-picker-row">
      <HamClockButton variant="danger" onClick={resetRailLayout}>
        RESET TO SHIPPED LAYOUT
      </HamClockButton>
      <HamClockButton onClick={() => setDraftName("")}>
        SAVE AS PRESET
      </HamClockButton>
    </div>
  );
}

/**
 * Pages & Tiles: presets first (large one-shot cards, §7), then the
 * page/rail picker an operator uses to hand-tune the composition the preset
 * left them with (§6). `HAMCLOCK_WALL_PAGES` still names the five page slots
 * — this batch does not let an operator add or remove a page, only edit what
 * each one shows.
 */
export function PagesTilesTab() {
  const [pageId, setPageId] = useState<string>(HAMCLOCK_WALL_PAGES[0].id);
  const [side, setSide] = useState<HamClockRailSide>("left");
  const [themeOffer, setThemeOffer] = useState<WallPreset | null>(null);

  return (
    <div className="hcc-tabgrid hcc-pages-tiles">
      <PresetCards onThemeOffer={setThemeOffer} />
      {themeOffer && (
        <ThemeOfferBanner
          preset={themeOffer}
          onDismiss={() => setThemeOffer(null)}
        />
      )}
      <SlotEditor
        key={`${pageId}-${side}`}
        pageId={pageId}
        side={side}
        onPageChange={setPageId}
        onSideChange={setSide}
      />
      <ResetAndSaveRow />
    </div>
  );
}
