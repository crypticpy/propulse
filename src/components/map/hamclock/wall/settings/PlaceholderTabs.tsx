/**
 * Layers and Map content land in B6 (layer registry, Layers tab, map style
 * chooser). Until then these tabs exist only to say what is coming — no
 * controls, so there is nothing here to accidentally duplicate or drift from
 * `LayersPopover` before the registry it will read from exists.
 */
export function LayersTab() {
  return (
    <div className="hcc-placeholder">
      <p className="hcc-placeholder-title">LAYERS</p>
      <p className="hcc-placeholder-body">
        A layer registry with source, cadence and coverage for every map
        layer is coming in B6 — this tab will list them by category with live
        ON/OFF toggles.
      </p>
    </div>
  );
}

export function MapTab() {
  return (
    <div className="hcc-placeholder">
      <p className="hcc-placeholder-title">MAP</p>
      <p className="hcc-placeholder-body">
        A map style chooser — Esri, OSM, CARTO dark, Mapbox satellite and
        night lights — is coming in B6.
      </p>
    </div>
  );
}
