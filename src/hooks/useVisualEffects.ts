import { useSyncExternalStore } from "react";
import {
  useVisualEffectsStore,
  type VisualEffectsPreferences,
} from "@/stores/visualEffectsStore";

/** Legacy rank-specific particle/tilt opt-outs remain additional consumer gates. */
export function resolveVisualEffects(
  preferences: VisualEffectsPreferences,
  reducedMotion: boolean,
) {
  const enabled = preferences.level !== "off";
  const motion = preferences.level === "full" && !reducedMotion;
  return {
    level: preferences.level,
    celebrations: enabled && preferences.celebrations,
    animatedBadges: motion && preferences.animatedBadges,
    particles: motion && preferences.particles,
    glow: enabled && preferences.glow,
    motion,
    reducedMotion,
  };
}

const query = "(prefers-reduced-motion: reduce)";
function media() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;
}
function subscribe(onChange: () => void) {
  const preference = media();
  if (!preference) return () => {};
  if (preference.addEventListener) {
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
  }
  preference.addListener(onChange);
  return () => preference.removeListener(onChange);
}
const snapshot = () => media()?.matches ?? false;
const serverSnapshot = () => true;

export function useVisualEffects() {
  const preferences = useVisualEffectsStore();
  const reducedMotion = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return resolveVisualEffects(preferences, reducedMotion);
}
