/**
 * Share State Encoding/Decoding Utilities
 *
 * Encodes and decodes PropSphere map state for shareable URLs.
 * Uses compact encoding to keep URLs short while preserving all relevant state.
 */

import type { ViewMode, TargetLocation } from "@/stores/mapStore";

/**
 * Share state interface - all the state that can be shared via URL
 */
export interface ShareState {
  /** View mode: globe, flat, or azimuthal */
  viewMode: ViewMode;
  /** Target location coordinates and name */
  target: TargetLocation | null;
  /** Time offset from current time in hours (-24 to +24) */
  timeOffset: number;
  /** Which layers are enabled */
  layers: {
    terminator: boolean;
    greyline: boolean;
    aurora: boolean;
    muf: boolean;
    nvis: boolean;
    spots: boolean;
    nightLights: boolean;
    labels: boolean;
  };
  /** Path mode: short or long */
  pathMode: "short" | "long";
}

/**
 * Compact layer flags - encode 8 boolean layers as a single number (bitmask)
 */
const LAYER_FLAGS = {
  terminator: 1 << 0,
  greyline: 1 << 1,
  aurora: 1 << 2,
  muf: 1 << 3,
  nvis: 1 << 4,
  spots: 1 << 5,
  nightLights: 1 << 6,
  labels: 1 << 7,
} as const;

/**
 * View mode short codes for URL compactness
 */
const VIEW_MODE_CODES: Record<ViewMode, string> = {
  globe: "g",
  flat: "f",
  azimuthal: "a",
};

const CODE_TO_VIEW_MODE: Record<string, ViewMode> = {
  g: "globe",
  f: "flat",
  a: "azimuthal",
};

/**
 * Encode layers object to a compact number (0-255)
 */
function encodeLayers(layers: ShareState["layers"]): number {
  let flags = 0;
  for (const [layer, bit] of Object.entries(LAYER_FLAGS)) {
    if (layers[layer as keyof typeof LAYER_FLAGS]) {
      flags |= bit;
    }
  }
  return flags;
}

/**
 * Decode compact number back to layers object
 */
function decodeLayers(flags: number): ShareState["layers"] {
  return {
    terminator: (flags & LAYER_FLAGS.terminator) !== 0,
    greyline: (flags & LAYER_FLAGS.greyline) !== 0,
    aurora: (flags & LAYER_FLAGS.aurora) !== 0,
    muf: (flags & LAYER_FLAGS.muf) !== 0,
    nvis: (flags & LAYER_FLAGS.nvis) !== 0,
    spots: (flags & LAYER_FLAGS.spots) !== 0,
    nightLights: (flags & LAYER_FLAGS.nightLights) !== 0,
    labels: (flags & LAYER_FLAGS.labels) !== 0,
  };
}

/**
 * Encode coordinate to a compact string (3 decimal places)
 */
function encodeCoord(coord: number): string {
  return coord.toFixed(3);
}

/**
 * Encode share state to URL search params
 *
 * Format:
 * - v: view mode (g/f/a)
 * - t: time offset (-24 to +24)
 * - l: layer flags (0-255)
 * - p: path mode (s/l)
 * - lat: target latitude
 * - lon: target longitude
 * - n: target name (optional)
 * - gr: target grid (optional)
 */
export function encodeShareState(state: ShareState): URLSearchParams {
  const params = new URLSearchParams();

  // View mode
  params.set("v", VIEW_MODE_CODES[state.viewMode]);

  // Time offset (only if non-zero)
  if (state.timeOffset !== 0) {
    params.set("t", state.timeOffset.toString());
  }

  // Layers as bitmask
  const layerFlags = encodeLayers(state.layers);
  params.set("l", layerFlags.toString());

  // Path mode (only if long)
  if (state.pathMode === "long") {
    params.set("p", "l");
  }

  // Target location
  if (state.target) {
    params.set("lat", encodeCoord(state.target.lat));
    params.set("lon", encodeCoord(state.target.lon));
    if (state.target.name) {
      params.set("n", state.target.name);
    }
    if (state.target.grid) {
      params.set("gr", state.target.grid);
    }
  }

  return params;
}

/**
 * Generate a full shareable URL from state
 */
export function generateShareURL(state: ShareState, baseURL?: string): string {
  const base = baseURL || window.location.origin + "/map";
  const params = encodeShareState(state);
  return `${base}?${params.toString()}`;
}

/**
 * Decode URL search params back to share state
 */
export function decodeShareState(
  params: URLSearchParams,
): Partial<ShareState> | null {
  const result: Partial<ShareState> = {};

  // View mode
  const viewCode = params.get("v");
  if (viewCode && CODE_TO_VIEW_MODE[viewCode]) {
    result.viewMode = CODE_TO_VIEW_MODE[viewCode];
  }

  // Time offset
  const timeStr = params.get("t");
  if (timeStr) {
    const offset = parseInt(timeStr, 10);
    if (!isNaN(offset) && offset >= -24 && offset <= 24) {
      result.timeOffset = offset;
    }
  }

  // Layers
  const layerStr = params.get("l");
  if (layerStr) {
    const flags = parseInt(layerStr, 10);
    if (!isNaN(flags) && flags >= 0 && flags <= 255) {
      result.layers = decodeLayers(flags);
    }
  }

  // Path mode
  const pathCode = params.get("p");
  if (pathCode === "l") {
    result.pathMode = "long";
  } else {
    result.pathMode = "short";
  }

  // Target location
  const lat = params.get("lat");
  const lon = params.get("lon");
  if (lat && lon) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (
      !isNaN(latNum) &&
      !isNaN(lonNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lonNum >= -180 &&
      lonNum <= 180
    ) {
      result.target = {
        lat: latNum,
        lon: lonNum,
        name: params.get("n") || undefined,
        grid: params.get("gr") || undefined,
      };
    }
  }

  // Return null if nothing was decoded
  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

/**
 * Check if URL has share params
 */
export function hasShareParams(params: URLSearchParams): boolean {
  return params.has("v") || params.has("lat") || params.has("l");
}

/**
 * Generate Twitter/X share text for a path analysis
 */
export function generateTwitterText(state: ShareState): string {
  const parts: string[] = [];

  if (state.target) {
    const targetName = state.target.name || state.target.grid || "target";
    parts.push(`Analyzing HF propagation path to ${targetName}`);
  } else {
    parts.push("Check out this HF propagation view");
  }

  parts.push("on PropSphere!");

  // Add relevant context
  if (state.timeOffset !== 0) {
    parts.push(
      `(${state.timeOffset > 0 ? "+" : ""}${state.timeOffset}h from now)`,
    );
  }

  return parts.join(" ");
}

/**
 * Create share content object for various share types
 */
export interface ShareContent {
  title: string;
  text: string;
  url: string;
}

export function createShareContent(state: ShareState): ShareContent {
  const url = generateShareURL(state);
  const targetName = state.target?.name || state.target?.grid;

  let title = "PropSphere - HF Propagation Visualizer";
  let text = "Check out this HF propagation view on PropSphere!";

  if (targetName) {
    title = `Path to ${targetName} - PropSphere`;
    text = `Analyzing HF propagation path to ${targetName}`;
  }

  return { title, text, url };
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
