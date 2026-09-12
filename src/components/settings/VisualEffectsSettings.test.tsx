import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
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

function renderSettings() {
  return render(
    <MemoryRouter>
      <VisualEffectsSettings />
    </MemoryRouter>,
  );
}

describe("VisualEffectsSettings", () => {
  beforeEach(() => {
    reducedMotion = false;
    useVisualEffectsStore.getState().reset();
    useVisualEffectsStore.getState().resetPresentation();
  });
  afterEach(cleanup);

  it("remembers individual choices across preset caps and resets only effects", () => {
    renderSettings();
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

  it("explains local presentation scope and restores hidden modules without touching effects", () => {
    renderSettings();
    expect(screen.getByText(/These choices affect only what you see here/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Profile → Social → Visibility Settings/ }).getAttribute("href")).toBe("/profile");
    fireEvent.click(screen.getByRole("switch", { name: "Rank badge" }));
    fireEvent.click(screen.getByRole("switch", { name: "Achievement badges" }));
    expect(useVisualEffectsStore.getState().showRankBadge).toBe(false);
    expect(useVisualEffectsStore.getState().showAchievements).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Show all rank modules" }));
    expect(useVisualEffectsStore.getState().showRankBadge).toBe(true);
    expect(useVisualEffectsStore.getState().showAchievements).toBe(true);
    expect(useVisualEffectsStore.getState().level).toBe("subtle");
  });

  it("explains the OS motion cap and unavailable persistence", () => {
    reducedMotion = true;
    useVisualEffectsStore.setState({ persistenceAvailable: false, level: "full" });
    renderSettings();
    expect(screen.getByText("Reduced motion is active")).toBeTruthy();
    expect(screen.getByText("Preferences are temporary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));
    expect(screen.queryByText("Preferences are temporary")).toBeNull();
  });
});
