// ---------------------------------------------------------------------------
// fftStreamParams — shared helpers for FFT stream configuration + UI labels.
// ---------------------------------------------------------------------------

/** Requested daemon FFT FPS for the wideband scope/waterfall stream. */
export const DEFAULT_FFT_STREAM_FPS = 60;

export function computeEffectiveWaterfallRowsPerSecond(
  speed: number,
  rowHeight: number,
  fps: number = DEFAULT_FFT_STREAM_FPS,
): number {
  const s = Number.isFinite(speed) ? speed : 1;
  const rh = Math.max(1, Math.round(rowHeight));
  const f = Number.isFinite(fps) ? fps : DEFAULT_FFT_STREAM_FPS;
  return Math.max(0, s * rh * f);
}
