export const RADAR_TEXTURE_BUDGET = {
  /** Web-Mercator zoom for the global bake (was 2 → soft 1024² world). */
  zoom: 3,
  tilesPerAxis: 8,
  tileSize: 256 as 256 | 512,
  /** Fewer frames offsets the denser tile grid. */
  maxFrames: 3,
} as const;

export function radarRequestBudget(): number {
  return (
    RADAR_TEXTURE_BUDGET.tilesPerAxis ** 2 *
    RADAR_TEXTURE_BUDGET.maxFrames
  );
}

export function radarRawTextureBytes(): number {
  const canvasSize =
    RADAR_TEXTURE_BUDGET.tilesPerAxis * RADAR_TEXTURE_BUDGET.tileSize;
  return canvasSize ** 2 * 4 * RADAR_TEXTURE_BUDGET.maxFrames;
}

export function selectInitialRadarFrameIndex(
  framesToLoad: readonly number[],
  pastCount: number,
): number | undefined {
  for (let index = framesToLoad.length - 1; index >= 0; index -= 1) {
    const frameIndex = framesToLoad[index];
    if (frameIndex < pastCount) return frameIndex;
  }
  return framesToLoad[framesToLoad.length - 1];
}
