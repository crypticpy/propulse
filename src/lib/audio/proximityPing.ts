/**
 * Proximity ping (G18) — a soft sonar-style cue for the QTH scope.
 *
 * Closer events ping louder and slightly higher. Uses the same singleton
 * AudioContext pattern as alertSynthesizer; callers must only invoke this
 * after a user gesture enabled audio (browser autoplay policy).
 *
 * @module lib/audio/proximityPing
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (audioCtx && audioCtx.state !== "closed") {
    return audioCtx;
  }
  audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * Play a short sonar ping scaled by proximity.
 * proximity 1 = at the QTH (loud, bright), 0 = at scope edge (faint).
 */
export function playProximityPing(proximity: number): void {
  const clamped = Math.max(0, Math.min(1, proximity));
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520 + 260 * clamped, now);
    const peak = 0.04 + 0.16 * clamped;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // Audio is a courtesy — never let it break the scope
  }
}
