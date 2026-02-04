/**
 * useWatchAlerts Hook
 *
 * Monitors incoming DX spots against active watches and plays audio alerts
 * when matches are found.
 *
 * Features:
 * - Listens to watch store for new matches
 * - Plays distinct sounds for callsign, grid, and entity watches
 * - Respects cooldown period to prevent alert spam
 * - Triggers visual pulse animation on WatchIndicator
 * - Integrates with user preferences for volume and mute control
 *
 * @example
 * ```tsx
 * function PropSphere() {
 *   // Enable watch alerts for the entire PropSphere view
 *   useWatchAlerts({ enabled: true });
 *
 *   return <GlobeView />;
 * }
 * ```
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import {
  useWatchStore,
  type WatchMatch,
  type WatchItem,
} from "@/stores/watchStore";
import { useUserStore } from "@/stores/userStore";
import {
  playAlertSound,
  setVolume,
  setMuted,
  initAudioContext,
  isAudioAvailable,
} from "@/lib/services/watchAudioService";
import {
  DEFAULT_WATCH_ALERT_PREFERENCES,
  type WatchAlertType,
  type WatchAlertPreferences,
} from "@/types/user";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for the useWatchAlerts hook
 */
export interface UseWatchAlertsOptions {
  /**
   * Enable or disable alert monitoring
   * @default true
   */
  enabled?: boolean;
}

/**
 * Return value from the useWatchAlerts hook
 */
export interface UseWatchAlertsReturn {
  /** Whether audio alerts are currently enabled and available */
  isActive: boolean;
  /** Whether the audio service is available in this browser */
  isAudioSupported: boolean;
  /** Current alert preferences */
  preferences: WatchAlertPreferences;
  /** Update alert preferences */
  updatePreferences: (prefs: Partial<WatchAlertPreferences>) => void;
  /** Play a test sound */
  playTest: (type?: WatchAlertType) => Promise<boolean>;
  /** Number of alerts triggered this session */
  alertCount: number;
  /** Timestamp of last alert */
  lastAlertTime: Date | null;
  /** Whether an alert was recently triggered (for visual pulse) */
  recentlyAlerted: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** How long the "recently alerted" state persists (for visual feedback) */
const RECENT_ALERT_DURATION_MS = 2000;

/** Number of initial renders to skip (avoid alerting on page load) */
const INITIAL_SKIP_RENDERS = 3;

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for monitoring watch matches and playing audio alerts
 */
export function useWatchAlerts(
  options: UseWatchAlertsOptions = {},
): UseWatchAlertsReturn {
  const { enabled = true } = options;

  // =========================================================================
  // REFS
  // =========================================================================

  /** Track render count to skip initial alerts */
  const renderCount = useRef(0);

  /** Track alert cooldowns by watch ID */
  const cooldownMap = useRef<Map<string, number>>(new Map());

  /** Track total alerts this session */
  const alertCountRef = useRef(0);

  /** Track last alert time */
  const lastAlertTimeRef = useRef<Date | null>(null);

  /** Track recently alerted state */
  const recentlyAlertedRef = useRef(false);

  /** Timer for clearing recently alerted state */
  const recentAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

  /** Track previously seen match IDs to detect new matches */
  const seenMatchIdsRef = useRef<Set<string>>(new Set());

  /** Audio context initialized flag */
  const audioInitializedRef = useRef(false);

  // =========================================================================
  // STORE ACCESS
  // =========================================================================

  const matches = useWatchStore((state) => state.matches);
  const watches = useWatchStore((state) => state.watches);
  const preferences = useUserStore((state) => state.preferences);

  // Get watch alert preferences with defaults
  const watchAlertPrefs = useMemo(
    () => preferences.watchAlerts ?? DEFAULT_WATCH_ALERT_PREFERENCES,
    [preferences.watchAlerts],
  );

  // Update preferences function
  const updatePreferences = useCallback(
    (prefs: Partial<WatchAlertPreferences>) => {
      useUserStore.getState().updatePreferences({
        watchAlerts: {
          ...watchAlertPrefs,
          ...prefs,
        },
      });
    },
    [watchAlertPrefs],
  );

  // =========================================================================
  // AUDIO INITIALIZATION
  // =========================================================================

  // Initialize audio on first user interaction
  useEffect(() => {
    if (!enabled || audioInitializedRef.current) {
      return;
    }

    const handleUserInteraction = () => {
      if (!audioInitializedRef.current) {
        initAudioContext();
        audioInitializedRef.current = true;
      }
    };

    // Listen for any user interaction to initialize audio
    document.addEventListener("click", handleUserInteraction, { once: true });
    document.addEventListener("keydown", handleUserInteraction, { once: true });
    document.addEventListener("touchstart", handleUserInteraction, {
      once: true,
    });

    return () => {
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
    };
  }, [enabled]);

  // Sync volume and mute state with preferences
  useEffect(() => {
    setVolume(watchAlertPrefs.volume);
    setMuted(watchAlertPrefs.muted);
  }, [watchAlertPrefs.volume, watchAlertPrefs.muted]);

  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================

  /**
   * Get the alert type from a watch item
   */
  const getAlertType = useCallback((watch: WatchItem): WatchAlertType => {
    return watch.type as WatchAlertType;
  }, []);

  /**
   * Check if a specific alert type is enabled
   */
  const isAlertTypeEnabled = useCallback(
    (type: WatchAlertType): boolean => {
      switch (type) {
        case "callsign":
          return watchAlertPrefs.callsignAlerts;
        case "grid":
          return watchAlertPrefs.gridAlerts;
        case "entity":
          return watchAlertPrefs.entityAlerts;
        default:
          return false;
      }
    },
    [watchAlertPrefs],
  );

  /**
   * Check if a watch is in cooldown
   */
  const isInCooldown = useCallback(
    (watchId: string): boolean => {
      const lastAlertTime = cooldownMap.current.get(watchId);
      if (!lastAlertTime) {
        return false;
      }

      const cooldownMs = watchAlertPrefs.cooldownSeconds * 1000;
      return Date.now() - lastAlertTime < cooldownMs;
    },
    [watchAlertPrefs.cooldownSeconds],
  );

  /**
   * Record that an alert was fired for a watch
   */
  const recordAlert = useCallback((watchId: string) => {
    cooldownMap.current.set(watchId, Date.now());
    alertCountRef.current += 1;
    lastAlertTimeRef.current = new Date();
    recentlyAlertedRef.current = true;

    // Clear recently alerted after duration
    if (recentAlertTimerRef.current) {
      clearTimeout(recentAlertTimerRef.current);
    }
    recentAlertTimerRef.current = setTimeout(() => {
      recentlyAlertedRef.current = false;
    }, RECENT_ALERT_DURATION_MS);
  }, []);

  /**
   * Create a unique ID for a match
   */
  const getMatchId = useCallback((match: WatchMatch): string => {
    return `${match.watchId}:${match.spot.id}`;
  }, []);

  // =========================================================================
  // MAIN ALERT EFFECT
  // =========================================================================

  useEffect(() => {
    // Bail if disabled or alerts not enabled
    if (!enabled || !watchAlertPrefs.enabled) {
      return;
    }

    // Skip initial renders to avoid alerting on page load
    renderCount.current += 1;
    if (renderCount.current <= INITIAL_SKIP_RENDERS) {
      // Store current match IDs to not alert on them later
      for (const match of matches) {
        seenMatchIdsRef.current.add(getMatchId(match));
      }
      return;
    }

    // Find new matches we haven't seen yet
    const newMatches: WatchMatch[] = [];
    for (const match of matches) {
      const matchId = getMatchId(match);
      if (!seenMatchIdsRef.current.has(matchId)) {
        newMatches.push(match);
        seenMatchIdsRef.current.add(matchId);
      }
    }

    // Process new matches
    if (newMatches.length === 0) {
      return;
    }

    // Group matches by watch to prevent multiple alerts for same watch
    const matchesByWatch = new Map<string, WatchMatch[]>();
    for (const match of newMatches) {
      const existing = matchesByWatch.get(match.watchId) || [];
      existing.push(match);
      matchesByWatch.set(match.watchId, existing);
    }

    // Process each watch's matches
    for (const [watchId, watchMatches] of matchesByWatch) {
      // Find the watch
      const watch = watches.find((w) => w.id === watchId);
      if (!watch) {
        continue;
      }

      // Get alert type
      const alertType = getAlertType(watch);

      // Check if this alert type is enabled
      if (!isAlertTypeEnabled(alertType)) {
        continue;
      }

      // Check cooldown
      if (isInCooldown(watchId)) {
        continue;
      }

      // Play alert sound
      playAlertSound(alertType).then((success) => {
        if (success) {
          recordAlert(watchId);

          // Log for debugging
          console.debug(
            `[WatchAlerts] Played ${alertType} alert for watch "${watch.name || watch.pattern}"`,
            `(${watchMatches.length} new spots)`,
          );
        }
      });
    }
  }, [
    enabled,
    matches,
    watches,
    watchAlertPrefs.enabled,
    getAlertType,
    getMatchId,
    isAlertTypeEnabled,
    isInCooldown,
    recordAlert,
  ]);

  // =========================================================================
  // CLEANUP
  // =========================================================================

  useEffect(() => {
    return () => {
      if (recentAlertTimerRef.current) {
        clearTimeout(recentAlertTimerRef.current);
      }
    };
  }, []);

  // =========================================================================
  // PLAY TEST SOUND
  // =========================================================================

  const playTest = useCallback(
    async (type?: WatchAlertType): Promise<boolean> => {
      // Initialize audio if not already done
      if (!audioInitializedRef.current) {
        initAudioContext();
        audioInitializedRef.current = true;
      }

      if (type) {
        return playAlertSound(type);
      }

      // Play all three sounds in sequence
      const { playTestSound } =
        await import("@/lib/services/watchAudioService");
      return playTestSound();
    },
    [],
  );

  // =========================================================================
  // RETURN VALUE
  // =========================================================================

  return {
    isActive: enabled && watchAlertPrefs.enabled && !watchAlertPrefs.muted,
    isAudioSupported: isAudioAvailable(),
    preferences: watchAlertPrefs,
    updatePreferences,
    playTest,
    alertCount: alertCountRef.current,
    lastAlertTime: lastAlertTimeRef.current,
    recentlyAlerted: recentlyAlertedRef.current,
  };
}

export default useWatchAlerts;
