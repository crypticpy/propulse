import { useId, useState } from "react";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import {
  LAYER_REGISTRY,
  effectiveLayerCaveat,
  formatLayerProvenance,
} from "@/lib/map/layerRegistry";
import { ALL_PROVIDERS, selectTileProvider } from "@/lib/tiles/providers";
import type { TileProviderId } from "@/lib/tiles/types";
import { LAYER_PRESETS, useMapStore, type PresetName } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { HamClockButton, HamClockToggleRow } from "../controls";

interface StyleRowDef {
  id: TileProviderId;
  mapStyle: "satellite" | "standard";
  variant: "esri" | "mapbox" | "osm" | "dark";
  name: string;
}

const STYLE_ROWS: readonly StyleRowDef[] = [
  { id: "esri-world", mapStyle: "satellite", variant: "esri", name: "Satellite (Esri)" },
  {
    id: "mapbox-satellite",
    mapStyle: "satellite",
    variant: "mapbox",
    name: "Satellite (Mapbox)",
  },
  { id: "osm", mapStyle: "standard", variant: "osm", name: "Standard (OSM)" },
  { id: "carto-dark", mapStyle: "standard", variant: "dark", name: "Dark (CARTO)" },
];

function MapStyleRow({
  row,
  selected,
  disabled,
  caveat,
  onSelect,
}: {
  row: StyleRowDef;
  selected: boolean;
  disabled: boolean;
  caveat?: string;
  onSelect: () => void;
}) {
  const labelId = useId();
  const provider = ALL_PROVIDERS[row.id];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-labelledby={labelId}
      disabled={disabled}
      data-selected={selected ? "true" : "false"}
      className="hcc-style-row"
      onClick={onSelect}
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
          {provider.name} — {provider.coverageNote}
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
 * Map tab (B6/HW-55): the style rows apply live the moment they are
 * selected — there is no separate save step — and BACK restores whatever
 * style/provider/night-lights combination was active when the tab was
 * opened. `tileProviderId` is what makes Esri/Mapbox and OSM/CARTO dark
 * individually selectable instead of collapsing to the two-value
 * `mapStyle`; `selectTileProvider()` honours it before falling back to the
 * tier default, so a stale or Pro-gated id never silently renders anyway.
 *
 * Escape is deliberately not intercepted here: `AccessibleDialog`'s Escape
 * handler runs on a capture-phase document listener and calls
 * `stopImmediatePropagation`, so a nested handler in this tab can never see
 * the keypress before the whole settings dialog closes. Reaching in to
 * change that shared primitive is out of this batch's file list, and the
 * brief's own acceptance line for B6 only requires the BACK button to
 * restore, not Escape.
 */
export function MapTab() {
  const mapStyle = useMapStore((s) => s.mapStyle);
  const tileProviderId = useMapStore((s) => s.tileProviderId);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const setTileProviderId = useMapStore((s) => s.setTileProviderId);
  const nightLights = useMapStore((s) => s.layers.nightLights);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const viewMode = useMapStore((s) => s.viewMode);
  const activePreset = useMapStore((s) => s.activePreset);
  const applyPreset = useMapStore((s) => s.applyPreset);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);

  // Snapshot taken once, at mount — `HamClockTabs` only mounts the active
  // tab's content, so mount time is exactly "when the tab opened".
  const [initial] = useState(() => {
    const state = useMapStore.getState();
    return {
      mapStyle: state.mapStyle,
      tileProviderId: state.tileProviderId,
      nightLights: state.layers.nightLights,
    };
  });

  const effectiveProvider = selectTileProvider(
    mapStyle,
    subscriptionTier,
    tileProviderId,
  );

  function handleBack() {
    setMapStyle(initial.mapStyle);
    setTileProviderId(initial.tileProviderId);
    if (useMapStore.getState().layers.nightLights !== initial.nightLights) {
      toggleLayer("nightLights");
    }
  }

  const nightLightsEntry = LAYER_REGISTRY.nightLights;

  return (
    <div className="hcc-tabgrid hcc-map-tab">
      <div role="radiogroup" aria-label="Map style" className="hcc-style-list">
        {STYLE_ROWS.map((row) => {
          const requiresPro = ALL_PROVIDERS[row.id].requiresPro;
          const proBlocked = requiresPro && subscriptionTier !== "pro";
          return (
            <MapStyleRow
              key={row.id}
              row={row}
              selected={effectiveProvider.id === row.id}
              disabled={Boolean(proBlocked)}
              caveat={proBlocked ? "Pro plan required" : undefined}
              onSelect={() => {
                setMapStyle(row.mapStyle);
                setTileProviderId(row.id);
              }}
            />
          );
        })}
      </div>

      <HamClockToggleRow
        icon={<span className="hcc-layer-icon">{nightLightsEntry.icon}</span>}
        label={nightLightsEntry.name}
        detail={formatLayerProvenance(nightLightsEntry)}
        caveat={effectiveLayerCaveat("nightLights", viewMode)}
        checked={nightLights}
        onChange={() => toggleLayer("nightLights")}
      />

      <div className="hcc-map-foot">
        <p className="hcc-dialog-hint">SELECT to apply · BACK to cancel</p>
        <HamClockButton onClick={handleBack}>BACK</HamClockButton>
      </div>

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
    </div>
  );
}
