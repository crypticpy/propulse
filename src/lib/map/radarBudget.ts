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

/**
 * Choose up to `maxFrames` indices from past+nowcast, always reserving the
 * latest observation when past frames exist. Tail-only selection would drop
 * NEXRAD/observation pause when nowcast length >= maxFrames.
 */
export function selectRadarFramesToLoad(
  frameCount: number,
  pastCount: number,
  maxFrames: number = RADAR_TEXTURE_BUDGET.maxFrames,
): number[] {
  if (frameCount <= 0 || maxFrames <= 0) return [];
  if (frameCount <= maxFrames) {
    return Array.from({ length: frameCount }, (_, i) => i);
  }

  if (pastCount <= 0) {
    const startIdx = frameCount - maxFrames;
    return Array.from({ length: maxFrames }, (_, i) => startIdx + i);
  }

  const latestPast = pastCount - 1;
  const selected = new Set<number>([latestPast]);
  for (
    let i = frameCount - 1;
    i >= 0 && selected.size < maxFrames;
    i -= 1
  ) {
    selected.add(i);
  }
  return Array.from(selected).sort((a, b) => a - b);
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
