/**
 * Layout math for FlatMapView.
 *
 * Two boxes matter. The *map* box is the 2:1 equirectangular projection that
 * every draw call and hit-test works in. The *viewport* is the canvas element
 * and its backing buffer. In letterbox mode they coincide. In fillContainer
 * mode the viewport is the container and the map box covers it (center-cropped
 * on the long axis), so the projection is never stretched; the cropped part
 * stays reachable by panning and the pan offsets carry the centering.
 */

import type { FlatMapZoomState } from "@/types/map";

export interface MapBoxSize {
  width: number;
  height: number;
}

export interface FlatMapLayout {
  map: MapBoxSize;
  viewport: MapBoxSize;
}

const MIN_CONTAINER_WIDTH = 300;
const MIN_CONTAINER_HEIGHT = 150;

export function computeFlatMapLayout(
  rectWidth: number,
  rectHeight: number,
  fillContainer: boolean,
  aspectRatio: number,
): FlatMapLayout {
  const containerWidth = Math.max(MIN_CONTAINER_WIDTH, Math.floor(rectWidth));
  const containerHeight = Math.max(
    MIN_CONTAINER_HEIGHT,
    Math.floor(rectHeight),
  );

  if (fillContainer) {
    const mapHeight = Math.ceil(
      Math.max(containerWidth, containerHeight * 2) / 2,
    );
    return {
      map: { width: mapHeight * 2, height: mapHeight },
      viewport: { width: containerWidth, height: containerHeight },
    };
  }

  // Configurable aspect ratio letterbox — fit within both width AND height constraints
  const ratio = Math.max(1.0, Math.min(3.0, aspectRatio));
  const width = Math.min(containerWidth, Math.floor(containerHeight * ratio));
  const box = { width, height: Math.floor(width / ratio) };
  return { map: box, viewport: box };
}

/**
 * Keep the map edges at or beyond the viewport edges. The map box can be
 * larger than the viewport even at scale 1, so the lower bound is
 * "viewport minus scaled map", not "-(scale - 1) × size".
 */
export function clampMapOffsets(
  layout: FlatMapLayout,
  scale: number,
  offsetX: number,
  offsetY: number,
): { offsetX: number; offsetY: number } {
  const minOffsetX = layout.viewport.width - layout.map.width * scale;
  const minOffsetY = layout.viewport.height - layout.map.height * scale;
  return {
    offsetX: Math.max(minOffsetX, Math.min(0, offsetX)),
    offsetY: Math.max(minOffsetY, Math.min(0, offsetY)),
  };
}

/** Offsets that put the center of the scaled map box at the viewport center. */
export function centeredOffsets(
  layout: FlatMapLayout,
  scale: number,
): { offsetX: number; offsetY: number } {
  return {
    offsetX: (layout.viewport.width - layout.map.width * scale) / 2,
    offsetY: (layout.viewport.height - layout.map.height * scale) / 2,
  };
}

/**
 * Offsets that keep the same map point under the viewport center across a
 * layout change (container resize, aspect change). Works in normalized map
 * coordinates because the map box itself may have changed size.
 */
export function preservedCenterOffsets(
  prev: FlatMapLayout,
  next: FlatMapLayout,
  zoom: FlatMapZoomState,
): { offsetX: number; offsetY: number } {
  const u =
    (prev.viewport.width / 2 - zoom.offsetX) / (prev.map.width * zoom.scale);
  const v =
    (prev.viewport.height / 2 - zoom.offsetY) /
    (prev.map.height * zoom.scale);
  return {
    offsetX: next.viewport.width / 2 - u * next.map.width * zoom.scale,
    offsetY: next.viewport.height / 2 - v * next.map.height * zoom.scale,
  };
}
