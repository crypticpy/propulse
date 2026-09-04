export function clampWatts(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.max(1, Math.min(1500, Math.round(value)));
}

/**
 * Scale required TX power from an SNR estimate taken at 100W.
 * Returns an uncapped requirement so feasibility checks are honest —
 * paths needing >1500W must not appear `withinCeiling` at a 1500W station.
 * Floor is 10W when already meeting the SNR target.
 */
export function estimateRequiredPowerWatts(
  snrAt100W: number,
  targetSnr: number,
): number {
  const deltaDb = targetSnr - snrAt100W;
  if (deltaDb <= 0) {
    return 10;
  }
  const scale = Math.pow(10, deltaDb / 10);
  return Math.max(10, Math.round(100 * scale));
}

/** Keep the operator ceiling inside the radio's max output. */
export function clampCeilingToKit(
  ceilingWatts: number,
  kitMaxPowerWatts: number,
): number {
  const kit = Math.max(1, Math.round(kitMaxPowerWatts || 1500));
  return Math.min(clampWatts(ceilingWatts), kit);
}
