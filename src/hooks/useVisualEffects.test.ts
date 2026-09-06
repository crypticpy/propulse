import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_VISUAL_EFFECTS, useVisualEffectsStore } from "@/stores/visualEffectsStore";
import { resolveVisualEffects, useVisualEffects } from "./useVisualEffects";

afterEach(() => useVisualEffectsStore.setState({ ...DEFAULT_VISUAL_EFFECTS }));

it("Off suppresses every effect while retaining saved choices", () => {
  expect(resolveVisualEffects({ ...DEFAULT_VISUAL_EFFECTS, level: "off" }, false)).toEqual({
    level: "off", celebrations: false, animatedBadges: false, particles: false,
    glow: false, motion: false, reducedMotion: false,
  });
});
it("Subtle permits calm celebration and chosen static glow, never movement", () => {
  expect(resolveVisualEffects(DEFAULT_VISUAL_EFFECTS, false)).toEqual({
    level: "subtle", celebrations: true, animatedBadges: false, particles: false,
    glow: true, motion: false, reducedMotion: false,
  });
  expect(resolveVisualEffects({ ...DEFAULT_VISUAL_EFFECTS, glow: false, celebrations: false }, false))
    .toMatchObject({ glow: false, celebrations: false });
});
it("Full respects every saved opt-out, and OS reduced motion caps animation only", () => {
  const full = { ...DEFAULT_VISUAL_EFFECTS, level: "full" as const };
  expect(resolveVisualEffects(full, false)).toMatchObject({
    celebrations: true, animatedBadges: true, particles: true, glow: true, motion: true,
  });
  expect(resolveVisualEffects({ ...full, celebrations: false, animatedBadges: false, particles: false, glow: false }, false))
    .toMatchObject({ celebrations: false, animatedBadges: false, particles: false, glow: false });
  expect(resolveVisualEffects(full, true)).toEqual({
    level: "full", celebrations: true, animatedBadges: false, particles: false,
    glow: true, motion: false, reducedMotion: true,
  });
});

it("responds to OS and saved-choice changes immediately, and removes its media listener", () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: vi.fn((_event, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  useVisualEffectsStore.setState({ level: "full" });
  const { result, unmount } = renderHook(useVisualEffects);
  expect(result.current.motion).toBe(true);
  act(() => { media.matches = true; listeners.forEach((listener) => listener()); });
  expect(result.current).toMatchObject({ reducedMotion: true, motion: false, celebrations: true });
  act(() => useVisualEffectsStore.getState().setEffect("celebrations", false));
  expect(result.current.celebrations).toBe(false);
  act(() => { media.matches = false; listeners.forEach((listener) => listener()); });
  expect(result.current.motion).toBe(true);
  expect(result.current.celebrations).toBe(false);
  unmount();
  expect(listeners.size).toBe(0);
});

it("handles missing matchMedia and older media-query listeners", () => {
  vi.stubGlobal("matchMedia", undefined);
  const missing = renderHook(useVisualEffects);
  expect(missing.result.current.motion).toBe(false);
  missing.unmount();
  const media = { matches: true, addListener: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const old = renderHook(useVisualEffects);
  expect(old.result.current.reducedMotion).toBe(true);
  expect(media.addListener).toHaveBeenCalledOnce();
  old.unmount();
  expect(media.removeListener).toHaveBeenCalledWith(media.addListener.mock.calls[0][0]);
});
