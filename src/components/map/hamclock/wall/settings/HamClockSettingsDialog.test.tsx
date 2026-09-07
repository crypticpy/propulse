import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { HamClockSettingsDialog } from "./HamClockSettingsDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setOpen(true)}>
        SETTINGS
      </button>
      <HamClockSettingsDialog open={open} onClose={() => setOpen(false)} />
    </MemoryRouter>
  );
}

describe("HamClockSettingsDialog", () => {
  it("opens from the trigger with the seven tabs in order", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));

    expect(screen.getByRole("dialog")).not.toBeNull();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "View",
      "Display",
      "Pages & Tiles",
      "Layers",
      "Map",
      "Theme",
      "Kiosk",
    ]);
  });

  it("shows View first, and only mounts the active tab's content", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));

    expect(screen.getByRole("tab", { name: "View" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("switch", { name: "Auto-rotate" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Smart scaling" })).toBeNull();
    // Kiosk's content (which needs a router) is not mounted yet.
    expect(screen.queryByRole("button", { name: "OPEN KIOSK EDITOR" })).toBeNull();
  });

  it("switches tabs on click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));
    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "SETTINGS" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});


it("saves mode and projection choices across Settings tabs", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));
  fireEvent.click(screen.getByRole("radio", { name: "SATELLITES" }));
  expect(useHamClockStore.getState().hamclockMode).toBe("satellites");
  fireEvent.click(screen.getByRole("radio", { name: "AZIMUTHAL" }));
  expect(useMapStore.getState().viewMode).toBe("azimuthal");
  expect(useHamClockStore.getState().preferredViewMode).toBe("azimuthal");
  fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
  fireEvent.click(screen.getByRole("tab", { name: "View" }));
  expect(screen.getByRole("radio", { name: "AZIMUTHAL" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "ACTIVITY" }));
  fireEvent.click(screen.getByRole("radio", { name: "FLAT" }));
});


it("enables auto-rotate only for 3D and updates the existing speed setting", () => {
  useMapStore.getState().setViewMode("flat");
  useMapStore.getState().setAutoRotate(false);
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));
  expect(screen.getByRole("switch", { name: "Auto-rotate" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "3D" }));
  fireEvent.click(screen.getByRole("switch", { name: "Auto-rotate" }));
  expect(useMapStore.getState().autoRotate).toBe(true);
  fireEvent.change(screen.getByRole("slider", { name: "Auto-rotate speed" }), { target: { value: String(Math.log(3600)) } });
  expect(useMapStore.getState().autoRotateSpeed).toBe(3600);
  useMapStore.getState().setAutoRotate(false);
});
