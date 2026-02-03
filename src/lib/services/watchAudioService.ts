/**
 * Watch Audio Service
 *
 * Provides audio alert functionality for the Watch System using Web Audio API.
 * Generates distinct chime sounds for different watch types (callsign, grid, entity).
 *
 * Features:
 * - Three distinct alert sounds for different watch types
 * - Volume control (0-100)
 * - Master mute toggle
 * - Test sound functionality
 * - Graceful fallback if Web Audio API is unavailable
 */

import type { WatchAlertType } from "@/types/user";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Audio context singleton state
 */
interface AudioState {
  context: AudioContext | null;
  gainNode: GainNode | null;
  initialized: boolean;
}

// =============================================================================
// STATE
// =============================================================================

const audioState: AudioState = {
  context: null,
  gainNode: null,
  initialized: false,
};

/** Current volume level (0-1) */
let currentVolume = 0.5;

/** Current mute state */
let isMuted = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the audio context (must be called after user interaction)
 * Web Audio API requires user interaction before audio can be played
 */
export function initAudioContext(): boolean {
  if (audioState.initialized && audioState.context) {
    return true;
  }

  try {
    // Create audio context (with fallback for older browsers)
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      console.warn("Web Audio API not supported");
      return false;
    }

    audioState.context = new AudioContextClass();
    audioState.gainNode = audioState.context.createGain();
    audioState.gainNode.connect(audioState.context.destination);
    audioState.gainNode.gain.value = currentVolume;
    audioState.initialized = true;

    return true;
  } catch (error) {
    console.error("Failed to initialize audio context:", error);
    return false;
  }
}

/**
 * Resume audio context if suspended (browsers may suspend after inactivity)
 */
async function ensureAudioContextRunning(): Promise<boolean> {
  if (!audioState.context) {
    return initAudioContext();
  }

  if (audioState.context.state === "suspended") {
    try {
      await audioState.context.resume();
    } catch (error) {
      console.error("Failed to resume audio context:", error);
      return false;
    }
  }

  return audioState.context.state === "running";
}

// =============================================================================
// VOLUME & MUTE CONTROL
// =============================================================================

/**
 * Set the master volume for all watch alerts
 * @param volume - Volume level 0-100
 */
export function setVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(100, volume)) / 100;

  if (audioState.gainNode) {
    audioState.gainNode.gain.value = isMuted ? 0 : currentVolume;
  }
}

/**
 * Get the current volume level
 * @returns Volume level 0-100
 */
export function getVolume(): number {
  return Math.round(currentVolume * 100);
}

/**
 * Set the mute state
 * @param muted - Whether audio should be muted
 */
export function setMuted(muted: boolean): void {
  isMuted = muted;

  if (audioState.gainNode) {
    audioState.gainNode.gain.value = isMuted ? 0 : currentVolume;
  }
}

/**
 * Get the current mute state
 */
export function getMuted(): boolean {
  return isMuted;
}

// =============================================================================
// SOUND GENERATION
// =============================================================================

/**
 * Sound configuration for each watch type
 * Each type has a distinct musical pattern
 */
interface SoundConfig {
  /** Base frequency in Hz */
  frequencies: number[];
  /** Duration of each note in seconds */
  durations: number[];
  /** Type of waveform */
  waveType: OscillatorType;
  /** Gap between notes in seconds */
  gap: number;
}

/**
 * Sound configurations for different alert types
 *
 * - Callsign: Two-tone ascending chime (friendly, attention-getting)
 * - Grid: Three-note descending pattern (geographic/spatial feel)
 * - Entity: Single deep tone with harmonic (importance/weight)
 */
const SOUND_CONFIGS: Record<WatchAlertType, SoundConfig> = {
  callsign: {
    frequencies: [523.25, 659.25], // C5, E5 - major third, pleasant
    durations: [0.12, 0.18],
    waveType: "sine",
    gap: 0.05,
  },
  grid: {
    frequencies: [698.46, 587.33, 493.88], // F5, D5, B4 - descending
    durations: [0.1, 0.1, 0.15],
    waveType: "triangle",
    gap: 0.04,
  },
  entity: {
    frequencies: [349.23, 440], // F4, A4 - warm interval
    durations: [0.2, 0.25],
    waveType: "sine",
    gap: 0.08,
  },
};

/**
 * Play an oscillator note with envelope
 */
function playNote(
  context: AudioContext,
  gainNode: GainNode,
  frequency: number,
  startTime: number,
  duration: number,
  waveType: OscillatorType,
): void {
  const oscillator = context.createOscillator();
  const noteGain = context.createGain();

  oscillator.type = waveType;
  oscillator.frequency.value = frequency;

  // Connect through note-specific gain for envelope
  oscillator.connect(noteGain);
  noteGain.connect(gainNode);

  // Envelope: quick attack, sustain, gentle release
  const attackTime = 0.01;
  const releaseTime = duration * 0.3;

  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(0.8, startTime + attackTime);
  noteGain.gain.setValueAtTime(0.8, startTime + duration - releaseTime);
  noteGain.gain.linearRampToValueAtTime(0, startTime + duration);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);
}

/**
 * Play an alert sound for a specific watch type
 * @param type - The type of watch that triggered the alert
 * @returns Promise that resolves when sound starts (not when it finishes)
 */
export async function playAlertSound(type: WatchAlertType): Promise<boolean> {
  // Check if muted
  if (isMuted) {
    return false;
  }

  // Ensure audio context is running
  const isRunning = await ensureAudioContextRunning();
  if (!isRunning || !audioState.context || !audioState.gainNode) {
    return false;
  }

  const context = audioState.context;
  const gainNode = audioState.gainNode;
  const config = SOUND_CONFIGS[type];

  if (!config) {
    console.warn(`Unknown alert type: ${type}`);
    return false;
  }

  try {
    let currentTime = context.currentTime + 0.02; // Small offset to avoid clicks

    // Play each note in sequence
    for (let i = 0; i < config.frequencies.length; i++) {
      playNote(
        context,
        gainNode,
        config.frequencies[i],
        currentTime,
        config.durations[i],
        config.waveType,
      );
      currentTime += config.durations[i] + config.gap;
    }

    return true;
  } catch (error) {
    console.error("Failed to play alert sound:", error);
    return false;
  }
}

/**
 * Play a test sound to preview alert settings
 * Plays all three alert types in sequence
 */
export async function playTestSound(): Promise<boolean> {
  // Temporarily unmute for test if needed
  const wasMuted = isMuted;

  try {
    // Play callsign sound
    const success = await playAlertSound("callsign");

    if (success) {
      // Wait and play grid sound
      await new Promise((resolve) => setTimeout(resolve, 600));
      await playAlertSound("grid");

      // Wait and play entity sound
      await new Promise((resolve) => setTimeout(resolve, 600));
      await playAlertSound("entity");
    }

    return success;
  } finally {
    // Restore mute state (in case it was changed during test)
    if (wasMuted !== isMuted) {
      isMuted = wasMuted;
    }
  }
}

/**
 * Play a single test sound for a specific type
 * @param type - The type of alert sound to test
 */
export async function playTestSoundForType(
  type: WatchAlertType,
): Promise<boolean> {
  return playAlertSound(type);
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up audio resources
 * Call when component using audio is unmounted
 */
export function cleanupAudio(): void {
  if (audioState.context) {
    audioState.context.close().catch(() => {
      // Ignore errors during cleanup
    });
  }

  audioState.context = null;
  audioState.gainNode = null;
  audioState.initialized = false;
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Check if the audio service is available
 */
export function isAudioAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    )
  );
}

/**
 * Check if audio context is initialized and ready
 */
export function isAudioReady(): boolean {
  return audioState.initialized && audioState.context !== null;
}
