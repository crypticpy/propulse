/**
 * Alert Synthesizer — Rich Web Audio API tone generation
 *
 * Produces distinct audio patterns per alert severity and event type,
 * replacing the single 880Hz beep with musically meaningful cues:
 *
 * Severity patterns:
 *   INFO:     Single gentle chime (880Hz sine, 200ms, exponential decay)
 *   WARNING:  Two-tone alert (660Hz then 880Hz sawtooth, 200ms each, 100ms gap)
 *   CRITICAL: Three descending tones (1046->880->660Hz square, 150ms each, 50ms gap, repeat)
 *
 * Event type modifiers:
 *   GEOMAGNETIC_STORM / DST_STORM:           default frequencies
 *   RADIO_BLACKOUT / SOLAR_FLARE:            shift down 2 semitones
 *   PROTON_EVENT:                            add vibrato (5Hz LFO, +/-10Hz)
 *   CME_INCOMING:                            rising sweep 440->880Hz over 500ms
 *   BAND_OPENING / GREYLINE_APPROACHING / AURORA_WARNING: major chord arpeggio
 */

import type { AlertPriority, AlertType } from "@/types/alerts";

// =============================================================================
// SINGLETON AUDIO CONTEXT
// =============================================================================

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (audioCtx && audioCtx.state !== "closed") {
    return audioCtx;
  }
  audioCtx = new AudioContext();
  return audioCtx;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Semitone multiplier: 2^(-2/12) shifts down 2 semitones */
const SEMITONE_DOWN_2 = Math.pow(2, -2 / 12);

/** Event types that receive a -2 semitone shift */
const SHIFTED_TYPES = new Set<AlertType>(["RADIO_BLACKOUT", "SOLAR_FLARE"]);

/** Event types that receive cheerful major chord arpeggio instead of severity pattern */
const CHEERFUL_TYPES = new Set<AlertType>([
  "BAND_OPENING",
  "GREYLINE_APPROACHING",
  "AURORA_WARNING",
]);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Schedule a single oscillator tone with gain envelope.
 * Returns the stop time so callers can chain tones.
 */
function scheduleTone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gain: number,
): number {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(gain, startTime);
  // Exponential decay to near-zero at end
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(destination);

  osc.start(startTime);
  osc.stop(startTime + duration);

  // Cleanup on end
  osc.onended = () => {
    osc.disconnect();
    gainNode.disconnect();
  };

  return startTime + duration;
}

/**
 * Schedule a tone with vibrato (LFO modulating frequency).
 * Used for PROTON_EVENT alerts.
 */
function scheduleToneWithVibrato(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gain: number,
  lfoRate: number,
  lfoDepth: number,
): number {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  // LFO: modulates the main oscillator frequency
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(lfoRate, startTime);
  lfoGain.gain.setValueAtTime(lfoDepth, startTime);

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(destination);

  lfo.start(startTime);
  lfo.stop(startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);

  // Cleanup
  osc.onended = () => {
    osc.disconnect();
    gainNode.disconnect();
    lfo.disconnect();
    lfoGain.disconnect();
  };

  return startTime + duration;
}

/**
 * Schedule a frequency sweep (exponential ramp).
 * Used for CME_INCOMING alerts.
 */
function scheduleSweep(
  ctx: AudioContext,
  destination: AudioNode,
  startFreq: number,
  endFreq: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gain: number,
): number {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(destination);

  osc.start(startTime);
  osc.stop(startTime + duration);

  osc.onended = () => {
    osc.disconnect();
    gainNode.disconnect();
  };

  return startTime + duration;
}

// =============================================================================
// SEVERITY PATTERNS
// =============================================================================

/**
 * INFO: Single gentle chime — 880Hz sine, 200ms, soft exponential decay
 */
function playInfoPattern(
  ctx: AudioContext,
  destination: AudioNode,
  baseFreqs: number[],
  gain: number,
  useVibrato: boolean,
): number {
  const t = ctx.currentTime;
  const freq = baseFreqs[0] ?? 880;

  if (useVibrato) {
    return scheduleToneWithVibrato(
      ctx,
      destination,
      freq,
      "sine",
      t,
      0.2,
      gain,
      5,
      10,
    );
  }
  return scheduleTone(ctx, destination, freq, "sine", t, 0.2, gain);
}

/**
 * WARNING: Two-tone alert — 660Hz then 880Hz sawtooth, 200ms each, 100ms gap
 */
function playWarningPattern(
  ctx: AudioContext,
  destination: AudioNode,
  baseFreqs: number[],
  gain: number,
  useVibrato: boolean,
): number {
  const t = ctx.currentTime;
  const f1 = baseFreqs[1] ?? 660;
  const f2 = baseFreqs[0] ?? 880;

  let endTime: number;
  if (useVibrato) {
    scheduleToneWithVibrato(
      ctx,
      destination,
      f1,
      "sawtooth",
      t,
      0.2,
      gain,
      5,
      10,
    );
    endTime = scheduleToneWithVibrato(
      ctx,
      destination,
      f2,
      "sawtooth",
      t + 0.3,
      0.2,
      gain,
      5,
      10,
    );
  } else {
    scheduleTone(ctx, destination, f1, "sawtooth", t, 0.2, gain);
    endTime = scheduleTone(
      ctx,
      destination,
      f2,
      "sawtooth",
      t + 0.3,
      0.2,
      gain,
    );
  }
  return endTime;
}

/**
 * CRITICAL: Three descending tones — 1046->880->660Hz square, 150ms each, 50ms gap, repeated
 */
function playCriticalPattern(
  ctx: AudioContext,
  destination: AudioNode,
  baseFreqs: number[],
  gain: number,
  useVibrato: boolean,
): number {
  const t = ctx.currentTime;
  const f1 = baseFreqs[2] ?? 1046;
  const f2 = baseFreqs[0] ?? 880;
  const f3 = baseFreqs[1] ?? 660;

  const toneDuration = 0.15;
  const gap = 0.05;
  const step = toneDuration + gap;

  // Two rounds of the descending pattern
  let endTime = t;
  for (let round = 0; round < 2; round++) {
    const roundStart = t + round * (3 * step + 0.05);
    const freqs = [f1, f2, f3];
    for (let i = 0; i < 3; i++) {
      const toneStart = roundStart + i * step;
      if (useVibrato) {
        endTime = scheduleToneWithVibrato(
          ctx,
          destination,
          freqs[i],
          "square",
          toneStart,
          toneDuration,
          gain * 0.6,
          5,
          10,
        );
      } else {
        endTime = scheduleTone(
          ctx,
          destination,
          freqs[i],
          "square",
          toneStart,
          toneDuration,
          gain * 0.6,
        );
      }
    }
  }
  return endTime;
}

// =============================================================================
// CHEERFUL ARPEGGIO (BAND_OPENING, GREYLINE, AURORA)
// =============================================================================

/**
 * Play a major chord arpeggio: root, major 3rd, 5th, octave
 * Uses sine waves for a pleasant, non-alarming sound.
 */
function playCheerfulArpeggio(
  ctx: AudioContext,
  destination: AudioNode,
  gain: number,
): number {
  const t = ctx.currentTime;
  // C5 major chord arpeggio: C5 (523), E5 (659), G5 (784), C6 (1047)
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteDuration = 0.15;
  const noteGap = 0.05;
  const step = noteDuration + noteGap;

  let endTime = t;
  for (let i = 0; i < notes.length; i++) {
    endTime = scheduleTone(
      ctx,
      destination,
      notes[i],
      "sine",
      t + i * step,
      noteDuration,
      gain * 0.8,
    );
  }
  return endTime;
}

// =============================================================================
// CME SWEEP
// =============================================================================

/**
 * Play a rising sweep 440Hz -> 880Hz over 500ms for CME_INCOMING.
 */
function playCmeSweep(
  ctx: AudioContext,
  destination: AudioNode,
  gain: number,
): number {
  const t = ctx.currentTime;
  return scheduleSweep(ctx, destination, 440, 880, "sawtooth", t, 0.5, gain);
}

// =============================================================================
// MAIN SYNTHESIZER
// =============================================================================

/**
 * Synthesize and play a distinct alert tone based on priority and alert type.
 *
 * @param priority - Alert severity: INFO, WARNING, or CRITICAL
 * @param alertType - Optional event type for sound modifiers
 * @param volume - Volume 0-100 (default 50)
 */
export async function synthesizeAlertTone(
  priority: AlertPriority,
  alertType?: AlertType,
  volume?: number,
): Promise<void> {
  const ctx = getAudioContext();

  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Cannot resume without user gesture — bail silently
      return;
    }
  }

  const gain = Math.max(0, Math.min(1, (volume ?? 50) / 100));

  // --- Special event types override the severity pattern entirely ---

  // CME_INCOMING: rising sweep
  if (alertType === "CME_INCOMING") {
    playCmeSweep(ctx, ctx.destination, gain);
    return;
  }

  // Cheerful types: major chord arpeggio
  if (alertType && CHEERFUL_TYPES.has(alertType)) {
    playCheerfulArpeggio(ctx, ctx.destination, gain);
    return;
  }

  // --- Base frequencies, possibly shifted by event type ---

  // Default base: [880, 660, 1046] — A5, E5, C6
  let baseFreqs = [880, 660, 1046];

  if (alertType && SHIFTED_TYPES.has(alertType)) {
    baseFreqs = baseFreqs.map((f) => f * SEMITONE_DOWN_2);
  }

  const useVibrato = alertType === "PROTON_EVENT";

  // --- Play severity pattern ---

  switch (priority) {
    case "INFO":
      playInfoPattern(ctx, ctx.destination, baseFreqs, gain, useVibrato);
      break;
    case "WARNING":
      playWarningPattern(ctx, ctx.destination, baseFreqs, gain, useVibrato);
      break;
    case "CRITICAL":
      playCriticalPattern(ctx, ctx.destination, baseFreqs, gain, useVibrato);
      break;
  }
}

/**
 * Fire-and-forget convenience wrapper.
 * Swallows errors so callers don't need try/catch.
 */
export function playAlertTone(
  priority: AlertPriority,
  alertType?: AlertType,
  volume?: number,
): void {
  synthesizeAlertTone(priority, alertType, volume).catch(() => {
    // Web Audio API not available or user hasn't interacted — silently skip
  });
}
