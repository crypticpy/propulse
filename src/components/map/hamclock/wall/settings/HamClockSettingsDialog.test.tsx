import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
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
  it("opens from the trigger with the six tabs in order", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));

    expect(screen.getByRole("dialog")).not.toBeNull();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Display",
      "Pages & Tiles",
      "Layers",
      "Map",
      "Theme",
      "Kiosk",
    ]);
  });

  it("shows Display first, and only mounts the active tab's content", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));

    expect(screen.getByRole("tab", { name: "Display" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    // Smart scaling only exists on the Display tab.
    expect(screen.getByRole("switch", { name: "Smart scaling" })).toBeTruthy();
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
