import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NCSKeyboardHints } from "./NCSKeyboardHints";

// NCSKeyboardHints' only host, NCSLiveDashboard, has its own bubble-phase
// `window` keydown listener with a `case "Escape"` branch (gated on
// `showKeyboardHints`). That branch is now unreachable while this dialog is
// open, because AccessibleDialog's document-capture handler calls
// `stopImmediatePropagation()` before the event ever reaches the bubble
// phase — see AccessibleDialog.tsx's `handleKeyDown`. These tests render
// NCSKeyboardHints on its own (no NCSLiveDashboard in the tree), so there is
// no host `window` listener present at all: any observed close can only be
// AccessibleDialog's handler, not a coincidental host handler running too.

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<NCSKeyboardHints onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
  const heading = screen.getByRole("heading", { name: "Keyboard Shortcuts" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Keyboard Shortcuts" }),
  ).toHaveLength(1);
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<NCSKeyboardHints onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("still lists the '?' shortcut row, unaffected by the migration (AccessibleDialog only intercepts Escape/Tab)", () => {
  render(<NCSKeyboardHints onClose={vi.fn()} />);
  expect(screen.getByText("Toggle this overlay")).toBeTruthy();
  expect(screen.getByText("?")).toBeTruthy();
});
