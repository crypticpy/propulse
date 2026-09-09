import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QslSyncPanel } from "./QslSyncPanel";

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<QslSyncPanel isOpen onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "QSL Sync" });
  const heading = screen.getByRole("heading", { name: "QSL Sync" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(screen.getAllByRole("heading", { name: "QSL Sync" })).toHaveLength(1);
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<QslSyncPanel isOpen onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "QSL Sync" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("renders nothing when isOpen is false", () => {
  render(<QslSyncPanel isOpen={false} onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});
