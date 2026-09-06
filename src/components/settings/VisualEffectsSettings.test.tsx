import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualEffectsSettings } from "./VisualEffectsSettings";
import { useVisualEffectsStore } from "@/stores/visualEffectsStore";

let reducedMotion = false;
vi.mock("@/hooks/useVisualEffects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useVisualEffects")>();
  return {
    ...actual,
    useVisualEffects: () => actual.resolveVisualEffects(useVisualEffectsStore(), reducedMotion),
  };
});

describe("VisualEffectsSettings", () => {
  beforeEach(() => {
    reducedMotion = false;
    useVisualEffectsStore.getState().reset();
  });
  afterEach(cleanup);

  it("remembers individual choices across preset caps and resets only effects", () => {
    render(<VisualEffectsSettings />);
    fireEvent.click(screen.getByRole("switch", { name: "Decorative glow" }));
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(useVisualEffectsStore.getState().level).toBe("off");
    expect(screen.getByRole("status").textContent).toContain("Off: static");
    expect((screen.getByRole("switch", { name: "Animated badges and frames" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Full" }));
    expect(useVisualEffectsStore.getState().glow).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Reset effects to Subtle" }));
    expect(useVisualEffectsStore.getState().level).toBe("subtle");
    expect(useVisualEffectsStore.getState().glow).toBe(true);
  });

  it("explains the OS motion cap and unavailable persistence", () => {
    reducedMotion = true;
    useVisualEffectsStore.setState({ persistenceAvailable: false, level: "full" });
    render(<VisualEffectsSettings />);
    expect(screen.getByText("Reduced motion is active")).toBeTruthy();
    expect(screen.getByText("Preferences are temporary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));
    expect(screen.queryByText("Preferences are temporary")).toBeNull();
  });
});
