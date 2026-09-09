import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { SyncConflict } from "@/types/qso";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

const conflict: SyncConflict = {
  id: "conflict-1",
  entryId: "entry-1",
  localVersion: 1,
  localData: { callsign: "W1AW", date: "2026-01-01", timeOn: "1200" },
  remoteVersion: 2,
  remoteData: { callsign: "W1AW", date: "2026-01-01", timeOn: "1230" },
  conflictingFields: ["timeOn"],
  status: "pending",
  createdAt: "2026-01-01T12:00:00Z",
};

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<ConflictResolutionModal conflict={conflict} onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Resolve Sync Conflict" });
  const heading = screen.getByRole("heading", {
    name: "Resolve Sync Conflict",
  });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Resolve Sync Conflict" }),
  ).toHaveLength(1);
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<ConflictResolutionModal conflict={conflict} onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "Resolve Sync Conflict" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
