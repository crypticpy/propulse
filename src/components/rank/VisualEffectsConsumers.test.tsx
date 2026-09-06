import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisualEffectsStore, DEFAULT_VISUAL_EFFECTS } from "@/stores/visualEffectsStore";
import { StatCountUp } from "./StatCountUp";
import { MouseTilt } from "./MouseTilt";
import { ParticleAurora } from "./ParticleAurora";
import { RankBadge } from "./RankBadge";
import { RankUpCelebration } from "./RankUpCelebration";
import { CardSignature, EnergyBorderOverlay, FiligreeCorners } from "./LegendaryEffects";
import { ChromaticBorderOverlay, DimensionalRift, LivingSymbols, RuneCorners } from "./EtherealEffects";
import { getProfileFrameStyle, getProfileGlowStyle, getRankBorderStyle, getRankCardClasses, getRankPageVars } from "./RankBorderStyles";
import { resolveVisualEffects } from "@/hooks/useVisualEffects";

beforeEach(() => {
  useVisualEffectsStore.setState({ ...DEFAULT_VISUAL_EFFECTS, level: "full" });
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query === "(hover: hover)", addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("cancels in-flight numeric animation immediately when effects are disabled, preserving the exact value", () => {
  const request = vi.fn(() => 42);
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  render(<StatCountUp value="100.25 W" enabled />);
  expect(request).toHaveBeenCalledTimes(1);
  act(() => useVisualEffectsStore.setState({ level: "off" }));
  expect(cancel).toHaveBeenCalledWith(42);
  expect(screen.getByLabelText("100.25 W").textContent).toBe("100.25 W");
  expect(request).toHaveBeenCalledTimes(1);
});

it("retains the legacy tilt opt-out and removes tilt handlers and transforms when local motion is capped", () => {
  const { container, rerender } = render(<MouseTilt enabled={false}><button>Gear details</button></MouseTilt>);
  expect(container.querySelector('[style*="perspective"]')).toBeNull();
  rerender(<MouseTilt enabled><button>Gear details</button></MouseTilt>);
  expect(container.querySelector('[style*="perspective"]')).not.toBeNull();
  const button = screen.getByRole("button", { name: "Gear details" });
  button.focus();
  act(() => useVisualEffectsStore.setState({ level: "subtle" }));
  expect(document.activeElement).toBe(button);
  expect(screen.getByRole("button", { name: "Gear details" })).toBe(button);
  expect(container.querySelector('[style*="perspective"]')).toBeNull();
  expect(screen.getByRole("button", { name: "Gear details" })).toBeTruthy();
});

it("removes particle DOM on a policy change and preserves the rank-specific particle opt-out", () => {
  const { container, rerender } = render(<ParticleAurora enabled rank="ethereal" accentHex="#abcdef" />);
  expect(container.childElementCount).toBe(1);
  act(() => useVisualEffectsStore.setState({ particles: false }));
  expect(container.childElementCount).toBe(0);
  act(() => useVisualEffectsStore.setState({ particles: true }));
  rerender(<ParticleAurora enabled={false} rank="ethereal" accentHex="#abcdef" />);
  expect(container.childElementCount).toBe(0);
});

it("preserves earned badge identity while independently disabling animated badge motion and glow", () => {
  const { container } = render(<RankBadge rank="ethereal" />);
  const badge = container.firstElementChild as HTMLElement;
  expect(badge.style.animation).toContain("rankPrismatic");
  act(() => useVisualEffectsStore.setState({ animatedBadges: false }));
  expect(badge.style.animation).toBe("none");
  expect(badge.style.textShadow).not.toBe("none");
  act(() => useVisualEffectsStore.setState({ glow: false }));
  expect(badge.style.textShadow).toBe("none");
  expect(screen.getByText("Ethereal")).toBeTruthy();
});

it("keeps static earned ornaments, signatures and child content while removing animated decoration", () => {
  const { container } = render(<>
    <EnergyBorderOverlay enabled accentHex="#abcdef" />
    <ChromaticBorderOverlay enabled />
    <DimensionalRift enabled accentHex="#abcdef" />
    <FiligreeCorners enabled accentHex="#abcdef" />
    <RuneCorners enabled />
    <LivingSymbols enabled accentHex="#abcdef"><span>Operator symbol</span></LivingSymbols>
    <CardSignature enabled signature="Always learning" />
  </>);
  expect(container.querySelector(".legendary-energy-spin")).not.toBeNull();
  act(() => useVisualEffectsStore.setState({ level: "off" }));
  expect(container.querySelector(".legendary-energy-spin")).toBeNull();
  expect(container.querySelector(".ethereal-dimensional-pulse")).toBeNull();
  expect(container.querySelector(".ethereal-living-symbol")).toBeNull();
  expect(screen.getByText("Operator symbol")).toBeTruthy();
  expect(screen.getByText(/Always learning/)).toBeTruthy();
  for (const corner of container.querySelectorAll<HTMLElement>(".legendary-filigree-pulse, .ethereal-rune-pulse")) {
    expect(corner.style.animation).toBe("none");
    expect(corner.style.filter).toBe("none");
  }
});

it.each(["subtle", "reduced"])("shows a calm %s notice with no scroll lock, Escape interception, particles or timeout", (mode) => {
  vi.useFakeTimers();
  if (mode === "subtle") useVisualEffectsStore.setState({ level: "subtle" });
  else vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const dismiss = vi.fn();
  render(<RankUpCelebration fromRank="expert" toRank="master" onDismiss={dismiss} />);
  expect(screen.getByRole("status").textContent).toContain("New rank: Master");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(document.querySelector(".celebration-burst")).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  act(() => vi.advanceTimersByTime(8000));
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(dismiss).toHaveBeenCalledTimes(1);
});

it("honors independent particle and glow gates during a full celebration", () => {
  useVisualEffectsStore.setState({ particles: false, glow: false });
  render(<RankUpCelebration fromRank="expert" toRank="master" onDismiss={vi.fn()} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(document.querySelector(".celebration-burst")).toBeNull();
  expect(document.querySelector(".celebration-glow")).toBeNull();
  expect(screen.getByRole("heading").style.textShadow).toBe("none");
});

describe("rank presentation styles", () => {
  it("removes decoration without changing earned frame borders or text accents", () => {
    const off = resolveVisualEffects({ ...DEFAULT_VISUAL_EFFECTS, level: "off" }, false);
    expect(getRankBorderStyle("ethereal", "#abcdef", off).boxShadow).toBe("none");
    expect(getRankBorderStyle("ethereal", "#abcdef", off).border).toBe(getRankBorderStyle("ethereal", "#abcdef").border);
    expect(getProfileFrameStyle("ethereal", off).border).toBe(getProfileFrameStyle("ethereal").border);
    expect(getProfileFrameStyle("ethereal", off).boxShadow).toBe("none");
    expect(getProfileGlowStyle("ethereal", off).boxShadow).toBe("none");
    expect(getRankCardClasses("ethereal", off)).toBe("");
    expect(getRankPageVars("ethereal", off)).toMatchObject({ "--rank-glow": "transparent" });
    expect(getRankPageVars("ethereal", off)).toMatchObject({ "--rank-text-accent": (getRankPageVars("ethereal") as Record<string, string>)["--rank-text-accent"] });
  });
});
