import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { RenderCallback, RootState } from "@react-three/fiber";
import { MapAnimationClock } from "./MapAnimationClock";
import { useMapAnimationFrame } from "./hooks/useMapAnimationFrame";

const frames = vi.hoisted(() => new Set<RenderCallback>());
vi.mock("@react-three/fiber", async () => {
  const { useLayoutEffect } = await import("react");
  return { useFrame: (callback: RenderCallback) => {
    useLayoutEffect(() => {
      frames.add(callback);
      return () => { frames.delete(callback); };
    }, [callback]);
  } };
});
afterEach(() => { frames.clear(); });

function Update({ run, enabled = true }: { run: RenderCallback; enabled?: boolean }) {
  useMapAnimationFrame(run, enabled);
  return null;
}
function tick() {
  act(() => { for (const callback of frames) callback({} as RootState, 0.016); });
}

it("uses one root subscription for many material updates and releases it on unmount", () => {
  const run = vi.fn();
  const view = render(<MapAnimationClock>{Array.from({ length: 60 }, (_, i) => <Update key={i} run={run} />)}</MapAnimationClock>);
  expect(frames.size).toBe(1);
  tick();
  expect(run).toHaveBeenCalledTimes(60);
  view.unmount();
  expect(frames.size).toBe(0);
});

it("uses current callbacks and removes disabled or unmounted updates", () => {
  const old = vi.fn();
  const next = vi.fn();
  const removed = vi.fn();
  const view = render(<MapAnimationClock><Update run={old} /><Update run={removed} /></MapAnimationClock>);
  tick();
  view.rerender(<MapAnimationClock><Update run={next} /></MapAnimationClock>);
  tick();
  expect(old).toHaveBeenCalledTimes(1);
  expect(removed).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(1);
  view.rerender(<MapAnimationClock><Update run={next} enabled={false} /></MapAnimationClock>);
  tick();
  expect(next).toHaveBeenCalledTimes(1);
  view.rerender(<MapAnimationClock><Update run={next} /></MapAnimationClock>);
  tick();
  expect(next).toHaveBeenCalledTimes(2);
});
