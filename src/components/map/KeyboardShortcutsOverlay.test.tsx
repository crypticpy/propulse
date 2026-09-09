import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<KeyboardShortcutsOverlay isOpen onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
  const heading = screen.getByRole("heading", { name: "Keyboard Shortcuts" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Keyboard Shortcuts" }),
  ).toHaveLength(1);
});

it("wires the subtitle as aria-describedby (#773)", () => {
  render(<KeyboardShortcutsOverlay isOpen onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
  const describedBy = panel.getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();
  expect(document.getElementById(describedBy as string)?.textContent).toBe(
    "Quick access to PropSphere features",
  );
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<KeyboardShortcutsOverlay isOpen onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("renders nothing when closed", () => {
  render(<KeyboardShortcutsOverlay isOpen={false} onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});
