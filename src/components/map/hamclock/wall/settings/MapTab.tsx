import { useId, useRef, useState, type KeyboardEvent } from "react";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import { standardBasemapCaveat } from "@/lib/map/layerCapabilities";
import {
  LAYER_REGISTRY,
  effectiveLayerCaveat,
  formatLayerProvenance,
} from "@/lib/map/layerRegistry";
import { ALL_PROVIDERS, selectTileProvider } from "@/lib/tiles/providers";
import type { TileProviderId } from "@/lib/tiles/types";
import {
  LAYER_PRESETS,
  useMapStore,
  type PresetName,
  type ViewMode,
} from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import {
  HamClockButton,
  HamClockToggleRow,
  useHamClockDialogEscapeGuard,
} from "../controls";

interface StyleRowDef {
  /** `null` means "no provider override" — the projection draws its own
   * built-in basemap and the OSM-vs-CARTO choice does not reach the screen. */
  id: TileProviderId | null;
  mapStyle: "satellite" | "standard";
  variant: "esri" | "mapbox" | "osm" | "dark" | "standard";
  name: string;
  /** Overrides the provider-derived description line when `id` is null. */
  description?: string;
}

const ESRI_ROW: StyleRowDef = {
  id: "esri-world",
  mapStyle: "satellite",
  variant: "esri",
  name: "Satellite (Esri)",
};
const MAPBOX_ROW: StyleRowDef = {
  id: "mapbox-satellite",
  mapStyle: "satellite",
  variant: "mapbox",
  name: "Satellite (Mapbox)",
};
const OSM_ROW: StyleRowDef = {
  id: "osm",
  mapStyle: "standard",
  variant: "osm",
  name: "Standard (OSM)",
};
const CARTO_DARK_ROW: StyleRowDef = {
  id: "carto-dark",
  mapStyle: "standard",
  variant: "dark",
  name: "Dark (CARTO)",
};
/**
 * The single standard-bucket row offered on Flat/Azimuthal (B6 PR #222 fix
 * #1, corrected): both projections still render `mapStyle "standard"` as
 * their own generated basemap, so the style is fully selectable there — only
 * the OSM-vs-CARTO *provider* choice is meaningless, which is why this row
 * carries no provider id (selecting it clears any override) and shows the
 * "draws its own basemap" text as a plain detail line, not a disabled state.
 */
const STANDARD_BUILTIN_ROW: StyleRowDef = {
  id: null,
  mapStyle: "standard",
  variant: "standard",
  name: "Standard (built-in)",
  description: "Generated locally — no external tiles",
};

/** All style rows for the given projection (B6 PR #222 fix #1, corrected):
 * Globe offers all four individually selectable providers; Flat/Azimuthal
 * collapse OSM/CARTO into one always-enabled built-in row since neither
 * renders the chosen provider for the standard bucket. */
function getStyleRowsForViewMode(viewMode: ViewMode): readonly StyleRowDef[] {
  if (viewMode === "globe") {
    return [ESRI_ROW, MAPBOX_ROW, OSM_ROW, CARTO_DARK_ROW];
  }
  return [ESRI_ROW, MAPBOX_ROW, STANDARD_BUILTIN_ROW];
}

function MapStyleRow({
  row,
  selected,
  disabled,
  caveat,
  tabIndex,
  buttonRef,
  onSelect,
  onKeyDown,
}: {
  row: StyleRowDef;
  selected: boolean;
  disabled: boolean;
  caveat?: string;
  tabIndex: 0 | -1;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const labelId = useId();
  const provider = row.id ? ALL_PROVIDERS[row.id] : null;
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-labelledby={labelId}
      disabled={disabled}
      tabIndex={disabled ? -1 : tabIndex}
      data-selected={selected ? "true" : "false"}
      className="hcc-style-row"
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span
        className={`hcc-style-swatch hcc-style-swatch--${row.variant}`}
        aria-hidden="true"
      />
      <span className="hcc-style-text">
        <span className="hcc-style-name" id={labelId}>
          {row.name}
        </span>
        <span className="hcc-style-line">
          {provider
            ? `${provider.name} — ${provider.coverageNote}`
            : row.description}
        </span>
        {caveat && <span className="hcc-row-caveat">{caveat}</span>}
      </span>
      <span
        className="hcc-style-dot"
        data-selected={selected ? "true" : "false"}
        aria-hidden="true"
      />
      <span className="hcc-style-select" aria-hidden="true">
        {selected ? "SELECTED" : "SELECT"}
      </span>
    </button>
  );
}

/**
 * The style chooser sub-view (B6 PR #222 fixes #2/#3): opened in place of the
 * Map tab's normal content by the `CHANGE MAP STYLE` button, never a second
 * dialog. Moving the roving-tabIndex highlight (Arrow/Home/End, the same
 * approach as `HamClockSegmented`) previews a style live — it is applied to
 * `mapStore` immediately, exactly like a click, so the reader sees the wall
 * change behind the settings panel as they browse. Clicking a row (or
 * activating it with Enter/Space, which a native `<button>` turns into the
 * same click) commits and returns to the tab. BACK, and Escape while this
 * view is open (via `useHamClockDialogEscapeGuard`, so Escape cancels the
 * chooser instead of closing the whole settings dialog), restore whatever
 * was active when the chooser opened and return.
 */
function MapStyleChooser({
  viewMode,
  onDone,
}: {
  viewMode: ViewMode;
  onDone: () => void;
}) {
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const tileProviderId = useMapStore((s) => s.tileProviderId);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const setTileProviderId = useMapStore((s) => s.setTileProviderId);
  const buttonRefs = useRef(new Map<TileProviderId | null, HTMLButtonElement>());

  // Snapshot taken once, when the chooser opens, so BACK/Escape have
  // something to restore that is independent of any live preview applied
  // while browsing rows.
  const [snapshot] = useState(() => {
    const state = useMapStore.getState();
    return { mapStyle: state.mapStyle, tileProviderId: state.tileProviderId };
  });

  const effectiveProvider = selectTileProvider(
    mapStyle,
    subscriptionTier,
    tileProviderId,
  );

  function isRowSelected(row: StyleRowDef): boolean {
    return row.id === null
      ? mapStyle === "standard"
      : effectiveProvider.id === row.id;
  }

  const rows = getStyleRowsForViewMode(viewMode).map((row) => {
    const requiresPro = row.id ? ALL_PROVIDERS[row.id].requiresPro : false;
    const proBlocked = requiresPro && subscriptionTier !== "pro";
    const caveat = proBlocked
      ? "Pro plan required"
      : row.id === null
        ? standardBasemapCaveat(viewMode)
        : undefined;
    return { row, disabled: Boolean(proBlocked), caveat };
  });
  const enabledRows = rows.filter((entry) => !entry.disabled);

  function applyRow(row: StyleRowDef) {
    setMapStyle(row.mapStyle);
    setTileProviderId(row.id);
  }

  function restoreAndReturn() {
    setMapStyle(snapshot.mapStyle);
    setTileProviderId(snapshot.tileProviderId);
    onDone();
  }

  function commitAndReturn(row: StyleRowDef) {
    applyRow(row);
    onDone();
  }

  useHamClockDialogEscapeGuard(() => {
    restoreAndReturn();
    return true;
  });

  function focusRow(id: TileProviderId | null) {
    buttonRefs.current.get(id)?.focus();
  }

  // Roving tabIndex over the enabled rows, previewing live as the highlight
  // moves — the same Arrow/Home/End approach as `HamClockSegmented`.
  function moveHighlight(delta: number) {
    if (enabledRows.length === 0) return;
    const currentIndex = enabledRows.findIndex((entry) =>
      isRowSelected(entry.row),
    );
    const from = currentIndex === -1 ? 0 : currentIndex;
    const next =
      enabledRows[(from + delta + enabledRows.length) % enabledRows.length];
    applyRow(next.row);
    focusRow(next.row.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        event.preventDefault();
        if (enabledRows[0]) {
          applyRow(enabledRows[0].row);
          focusRow(enabledRows[0].row.id);
        }
        break;
      case "End": {
        event.preventDefault();
        const last = enabledRows[enabledRows.length - 1];
        if (last) {
          applyRow(last.row);
          focusRow(last.row.id);
        }
        break;
      }
      default:
        break;
    }
  }

  const selectedRow = enabledRows.find((entry) => isRowSelected(entry.row));
  const tabStopRowId = selectedRow ? selectedRow.row.id : enabledRows[0]?.row.id;

  return (
    <div className="hcc-tabgrid hcc-map-tab">
      <div role="radiogroup" aria-label="Map style" className="hcc-style-list">
        {rows.map(({ row, disabled, caveat }) => (
          <MapStyleRow
            key={row.id ?? "standard-builtin"}
            row={row}
            selected={isRowSelected(row)}
            disabled={disabled}
            caveat={caveat}
            tabIndex={row.id === tabStopRowId ? 0 : -1}
            buttonRef={(el) => {
              if (el) buttonRefs.current.set(row.id, el);
              else buttonRefs.current.delete(row.id);
            }}
            onSelect={() => commitAndReturn(row)}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>

      <div className="hcc-map-foot">
        <p className="hcc-dialog-hint">SELECT to apply · BACK to cancel</p>
        <HamClockButton onClick={restoreAndReturn}>BACK</HamClockButton>
      </div>
    </div>
  );
}

/**
 * Map tab (B6/HW-55, PR #222 fixes #2–#3): the style chooser is a sub-view
 * (`MapStyleChooser`) opened by `CHANGE MAP STYLE`, not a permanently-live
 * list — this tab itself just shows the current style at a glance. Night
 * lights and layer presets stay here and apply live with no cancel step;
 * they are plain toggles, not part of the cancelable chooser.
 * Observatory (#160) is a Map-tab action because the desk header that used
 * to launch it is gone; entering closes settings so the map is visible.
 */
export function MapTab({ onClose }: { onClose?: () => void } = {}) {
  const mapStyle = useMapStore((s) => s.mapStyle);
  const tileProviderId = useMapStore((s) => s.tileProviderId);
  const nightLights = useMapStore((s) => s.layers.nightLights);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const viewMode = useMapStore((s) => s.viewMode);
  const activePreset = useMapStore((s) => s.activePreset);
  const applyPreset = useMapStore((s) => s.applyPreset);
  const observatoryMode = useMapStore((s) => s.observatoryMode);
  const enterObservatory = useMapStore((s) => s.enterObservatory);
  const exitObservatory = useMapStore((s) => s.exitObservatory);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const [chooserOpen, setChooserOpen] = useState(false);

  if (chooserOpen) {
    return (
      <MapStyleChooser viewMode={viewMode} onDone={() => setChooserOpen(false)} />
    );
  }

  const effectiveProvider = selectTileProvider(
    mapStyle,
    subscriptionTier,
    tileProviderId,
  );
  // On Flat/Azimuthal, "standard" always means the built-in basemap — the
  // resolved provider id (osm by tier default, or a stale carto-dark
  // override) never reaches the screen there, so the summary must not show
  // "Standard (OSM)" (B6 PR #222 fix #1, corrected).
  const currentRow =
    mapStyle === "standard" && viewMode !== "globe"
      ? STANDARD_BUILTIN_ROW
      : (getStyleRowsForViewMode(viewMode).find(
          (row) => row.id === effectiveProvider.id,
        ) ?? ESRI_ROW);
  const nightLightsEntry = LAYER_REGISTRY.nightLights;

  return (
    <div className="hcc-tabgrid hcc-map-tab">
      <div className="hcc-map-current">
        <p className="hcc-seg-label">Map style</p>
        <div className="hcc-style-row hcc-style-row--static">
          <span
            className={`hcc-style-swatch hcc-style-swatch--${currentRow.variant}`}
            aria-hidden="true"
          />
          <span className="hcc-style-text">
            <span className="hcc-style-name">{currentRow.name}</span>
            <span className="hcc-style-line">
              {currentRow.id
                ? `${effectiveProvider.name} — ${effectiveProvider.coverageNote}`
                : currentRow.description}
            </span>
          </span>
        </div>
        <HamClockButton onClick={() => setChooserOpen(true)}>
          CHANGE MAP STYLE
        </HamClockButton>
      </div>

      <HamClockToggleRow
        icon={<span className="hcc-layer-icon">{nightLightsEntry.icon}</span>}
        label={nightLightsEntry.name}
        detail={formatLayerProvenance(nightLightsEntry)}
        caveat={effectiveLayerCaveat("nightLights", viewMode)}
        checked={nightLights}
        onChange={() => toggleLayer("nightLights")}
      />

      <div className="hcc-map-presets">
        <p className="hcc-seg-label">Layer presets</p>
        <div className="hcc-map-preset-buttons">
          {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => (
            <HamClockButton
              key={preset}
              variant={activePreset === preset ? "primary" : "quiet"}
              aria-pressed={activePreset === preset}
              title={PRESET_CONFIG[preset].description}
              onClick={() => applyPreset(preset)}
            >
              {PRESET_CONFIG[preset].label.toUpperCase()}
            </HamClockButton>
          ))}
        </div>
      </div>

      <div className="hcc-row hcc-action-row">
        <div className="hcc-row-main">
          <div className="hcc-row-text">
            <span className="hcc-row-label">Observatory</span>
            <span className="hcc-row-detail">
              {observatoryMode
                ? "Auto-rotating, zoom only"
                : "Lean-back auto-rotate; zoom only"}
            </span>
          </div>
          <HamClockButton
            onClick={() => {
              if (observatoryMode) {
                exitObservatory();
                return;
              }
              enterObservatory();
              onClose?.();
            }}
          >
            {observatoryMode ? "EXIT OBSERVATORY" : "ENTER OBSERVATORY"}
          </HamClockButton>
        </div>
      </div>
    </div>
  );
}
