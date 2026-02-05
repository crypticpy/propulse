/**
 * Map Renderer Adapter Contract
 *
 * Provides a stable interface for renderer-agnostic map interactions and overlays.
 * This enables features like contest overlays to remain consistent across:
 * - R3F globe (3D)
 * - Canvas 2D (flat/azimuthal)
 * - Future renderers (Mapbox/Esri) without coupling business logic to renderer code
 */

import { useMapStore } from "@/stores/mapStore";
import type { OverlayLayerModel, MapInteractionMode } from "@/types/mapOverlays";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TargetMetadata {
  name?: string;
  grid?: string;
}

export interface IMapRendererAdapter {
  setTarget: (target: LatLon | null, metadata?: TargetMetadata) => void;
  project?: (latLon: LatLon) => ScreenPoint | null;

  addOverlayLayer: (layerId: string, layerModel: OverlayLayerModel) => void;
  updateOverlayLayer: (layerId: string, layerModel: OverlayLayerModel) => void;
  removeOverlayLayer: (layerId: string) => void;

  setInteractionMode: (mode: MapInteractionMode) => void;

  onMapClick: (handler: (latLon: LatLon) => void) => () => void;
  onHover: (handler: (latLon: LatLon | null) => void) => () => void;
}

class StoreBackedAdapter implements IMapRendererAdapter {
  private clickHandlers = new Set<(latLon: LatLon) => void>();
  private hoverHandlers = new Set<(latLon: LatLon | null) => void>();

  setTarget(target: LatLon | null, metadata?: TargetMetadata) {
    if (!target) {
      useMapStore.getState().setTarget(null);
      return;
    }
    useMapStore.getState().setTarget({
      lat: target.lat,
      lon: target.lon,
      name: metadata?.name,
      grid: metadata?.grid,
    });
  }

  addOverlayLayer(layerId: string, layerModel: OverlayLayerModel) {
    useMapStore.getState().addOverlayLayer(layerId, layerModel);
  }

  updateOverlayLayer(layerId: string, layerModel: OverlayLayerModel) {
    useMapStore.getState().updateOverlayLayer(layerId, layerModel);
  }

  removeOverlayLayer(layerId: string) {
    useMapStore.getState().removeOverlayLayer(layerId);
  }

  setInteractionMode(mode: MapInteractionMode) {
    useMapStore.getState().setInteractionMode(mode);
  }

  onMapClick(handler: (latLon: LatLon) => void) {
    this.clickHandlers.add(handler);
    return () => this.clickHandlers.delete(handler);
  }

  onHover(handler: (latLon: LatLon | null) => void) {
    this.hoverHandlers.add(handler);
    return () => this.hoverHandlers.delete(handler);
  }

  /** Renderer integration point: dispatch a normalized map click */
  emitMapClick(latLon: LatLon) {
    for (const handler of this.clickHandlers) {
      try {
        handler(latLon);
      } catch {
        // ignore
      }
    }
  }

  /** Renderer integration point: dispatch a normalized hover update */
  emitHover(latLon: LatLon | null) {
    for (const handler of this.hoverHandlers) {
      try {
        handler(latLon);
      } catch {
        // ignore
      }
    }
  }
}

export class R3FGlobeAdapter extends StoreBackedAdapter {}
export class Canvas2DAdapter extends StoreBackedAdapter {}

