import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";
import { RadioSetupWizard } from "./RadioSetupWizard";

const WELCOME_KEY = "propulse-welcome-seen";

const renderWizard = () =>
  render(
    <MemoryRouter initialEntries={["/map"]}>
      <RadioSetupWizard />
    </MemoryRouter>,
  );

const wizard = () =>
  screen.queryByRole("dialog", { name: "Radio Setup Wizard" });

beforeEach(() => {
  localStorage.removeItem(WELCOME_KEY);
  useSettingsStore.setState({ radioSetupCompleted: false });
  // DetectionStep schedules `setTimeout(() => startDetection(), 100)` on
  // mount, which would flip on a real WebSocket connection attempt to the
  // bridge daemon. Fake timers let the dialog render in its initial
  // "detecting" step without that timer ever firing, since none of these
  // tests advance past it.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Radio setup wizard", () => {
  it("stays hidden until the welcome overlay has been dismissed", () => {
    renderWizard();
    expect(wizard()).toBeNull();
  });

  it("shows once welcome is dismissed and setup isn't complete, named by its visible heading (#773)", () => {
    localStorage.setItem(WELCOME_KEY, "true");
    renderWizard();
    const panel = wizard();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-modal")).toBe("true");
  });

  it("stays hidden when setup is already marked complete", () => {
    localStorage.setItem(WELCOME_KEY, "true");
    useSettingsStore.setState({ radioSetupCompleted: true });
    renderWizard();
    expect(wizard()).toBeNull();
  });

  it("is a modal dialog that AccessibleDialog closes on Escape, via skipSetup", () => {
    localStorage.setItem(WELCOME_KEY, "true");
    renderWizard();
    expect(wizard()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    // skipSetup persists radioSetupCompleted so the wizard doesn't reappear;
    // asserting on it (not just the dialog vanishing) proves skipSetup ran
    // rather than some unrelated unmount.
    expect(useSettingsStore.getState().radioSetupCompleted).toBe(true);
    expect(wizard()).toBeNull();
  });
});
