/**
 * Watch Audio Service
 *
 * Plays real MP3 notification sounds for watch alerts and solar events.
 * Sounds are pre-loaded from /sounds/ for instant playback.
 *
 * Sound files (CC0 licensed, from github.com/akx/Notifications):
 *   callsign → Chord (ascending pleasant chord)
 *   grid     → Glisten (shimmery, spatial)
 *   entity   → Sonar (deep sonar ping, very radio-appropriate)
 *   info     → Polite (subtle gentle ping)
 *   warning  → Calm (moderate attention)
 *   critical → Belligerent (urgent alarm)
 */

import type { WatchAlertType } from "@/types/user";
import type { AlertPriority } from "@/types/alerts";
import { useSettingsStore } from "@/stores/settingsStore";
import { isQuietHours } from "@/lib/utils/time";

// =============================================================================
// SOUND FILE MAPPING
// =============================================================================

const WATCH_SOUND_FILES: Record<WatchAlertType, string> = {
  callsign: "/sounds/alert-callsign.mp3",
  grid: "/sounds/alert-grid.mp3",
  entity: "/sounds/alert-entity.mp3",
};

const SOLAR_SOUND_FILES: Record<AlertPriority, string> = {
  INFO: "/sounds/alert-info.mp3",
  WARNING: "/sounds/alert-warning.mp3",
  CRITICAL: "/sounds/alert-critical.mp3",
};

// =============================================================================
// STATE
// =============================================================================

/** Pre-loaded Audio elements keyed by file path */
const audioCache = new Map<string, HTMLAudioElement>();

/** Whether we've attempted to preload */
let initialized = false;

/** Current volume level (0-1) */
let currentVolume = 0.5;

/** Current mute state */
let isMuted = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Preload all audio files for instant playback.
 * Should be called after first user interaction (click/key/touch).
 */
export function initAudioContext(): boolean {
  if (initialized) return true;

  try {
    const allPaths = [
      ...Object.values(WATCH_SOUND_FILES),
      ...Object.values(SOLAR_SOUND_FILES),
    ];

    for (const path of allPaths) {
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.volume = currentVolume;
      audioCache.set(path, audio);
    }

    initialized = true;
    return true;
  } catch (error) {
    console.error("Failed to initialize audio:", error);
    return false;
  }
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

  // Update volume on all cached audio elements
  for (const audio of audioCache.values()) {
    audio.volume = isMuted ? 0 : currentVolume;
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
 */
export function setMuted(muted: boolean): void {
  isMuted = muted;

  for (const audio of audioCache.values()) {
    audio.volume = isMuted ? 0 : currentVolume;
  }
}

/**
 * Get the current mute state
 */
export function getMuted(): boolean {
  return isMuted;
}

// =============================================================================
// PLAYBACK
// =============================================================================

/**
 * Play an MP3 sound file, allowing overlapping plays.
 * Clones the cached Audio element so the same sound can fire again
 * before the previous instance finishes.
 */
async function playSoundFile(path: string): Promise<boolean> {
  const cached = audioCache.get(path);
  if (!cached) {
    // Lazy-init if not preloaded
    if (!initialized) initAudioContext();
    const fallback = audioCache.get(path);
    if (!fallback) return false;
    return playSoundFile(path);
  }

  try {
    // Clone so overlapping alerts don't cut each other off
    const clone = cached.cloneNode(true) as HTMLAudioElement;
    clone.volume = isMuted ? 0 : currentVolume;
    await clone.play();
    return true;
  } catch (error) {
    // Autoplay policy may block — try original element as fallback
    try {
      cached.currentTime = 0;
      cached.volume = isMuted ? 0 : currentVolume;
      await cached.play();
      return true;
    } catch {
      console.error("Failed to play sound:", path, error);
      return false;
    }
  }
}

/**
 * Check mute, sound-enabled setting, and quiet hours
 */
function shouldPlay(): boolean {
  if (isMuted) return false;

  const { notifications } = useSettingsStore.getState();
  if (notifications?.soundEnabled === false) return false;
  if (
    isQuietHours(notifications?.quietHoursStart, notifications?.quietHoursEnd)
  )
    return false;

  return true;
}

/**
 * Play an alert sound for a specific watch type
 */
export async function playAlertSound(type: WatchAlertType): Promise<boolean> {
  if (!shouldPlay()) return false;

  const path = WATCH_SOUND_FILES[type];
  if (!path) {
    console.warn(`Unknown alert type: ${type}`);
    return false;
  }

  return playSoundFile(path);
}

/**
 * Play a solar/propagation alert sound based on priority level
 */
export async function playSolarAlertSound(
  priority: AlertPriority,
): Promise<boolean> {
  if (!shouldPlay()) return false;

  const path = SOLAR_SOUND_FILES[priority];
  if (!path) return false;

  return playSoundFile(path);
}

/**
 * Play a test sound — all three watch types in sequence.
 * Bypasses shouldPlay() checks since the user explicitly clicked "test".
 */
export async function playTestSound(): Promise<boolean> {
  if (!initialized) initAudioContext();

  const success = await playSoundFile(WATCH_SOUND_FILES.callsign);

  if (success) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await playSoundFile(WATCH_SOUND_FILES.grid);

    await new Promise((resolve) => setTimeout(resolve, 2400));
    await playSoundFile(WATCH_SOUND_FILES.entity);
  }

  return success;
}

/**
 * Play a single test sound for a specific type.
 * Bypasses shouldPlay() checks since the user explicitly clicked "test".
 */
export async function playTestSoundForType(
  type: WatchAlertType,
): Promise<boolean> {
  if (!initialized) initAudioContext();
  const path = WATCH_SOUND_FILES[type];
  if (!path) return false;
  return playSoundFile(path);
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up audio resources
 */
export function cleanupAudio(): void {
  for (const audio of audioCache.values()) {
    audio.pause();
    audio.src = "";
  }
  audioCache.clear();
  initialized = false;
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Check if audio playback is available
 */
export function isAudioAvailable(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

/**
 * Check if audio is initialized and ready
 */
export function isAudioReady(): boolean {
  return initialized && audioCache.size > 0;
}
