export function clampWatts(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.max(1, Math.min(1500, Math.round(value)));
}

/**
 * Scale required TX power from an SNR estimate taken at `currentWatts`
 * (chain power by default, 100 W only when the caller omits it).
 * Returns an uncapped requirement so feasibility checks are honest —
 * paths needing >1500W must not appear `withinCeiling` at a 1500W station.
 * Floor is 10W when already meeting the SNR target.
 */
export function estimateRequiredPowerWatts(
  snrAtCurrentPower: number,
  targetSnr: number,
  currentWatts = 100,
): number {
  const deltaDb = targetSnr - snrAtCurrentPower;
  if (deltaDb <= 0) {
    return 10;
  }
  const scale = Math.pow(10, deltaDb / 10);
  const reference = Number.isFinite(currentWatts) && currentWatts > 0
    ? currentWatts
    : 100;
  return Math.max(10, Math.round(reference * scale));
}

/** Keep the operator ceiling inside the radio's max output. */
export function clampCeilingToKit(
  ceilingWatts: number,
  kitMaxPowerWatts: number,
): number {
  const kit = Math.max(1, Math.round(kitMaxPowerWatts || 1500));
  return Math.min(clampWatts(ceilingWatts), kit);
}
