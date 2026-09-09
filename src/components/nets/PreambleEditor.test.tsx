import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Net } from "@/types/net";
import { PreambleEditor } from "./PreambleEditor";

const net: Net = {
  id: "net-1",
  name: "Example Net",
  type: "ragchew",
  description: "A test net",
  frequency: "146.520 MHz",
  mode: "FM",
  band: "2m",
  preambleTemplate: "Welcome to {{net_name}}",
  tags: [],
  visibility: "public",
  newcomerFriendly: true,
  subscriberCount: 0,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<PreambleEditor net={net} onClose={vi.fn()} onSave={vi.fn()} />);
  const panel = screen.getByRole("dialog", {
    name: "Edit Preamble Template",
  });
  const heading = screen.getByRole("heading", {
    name: "Edit Preamble Template",
  });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Edit Preamble Template" }),
  ).toHaveLength(1);
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<PreambleEditor net={net} onClose={onClose} onSave={vi.fn()} />);
  const panel = screen.getByRole("dialog", {
    name: "Edit Preamble Template",
  });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("saves the edited template and closes on Save click", () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<PreambleEditor net={net} onClose={onClose} onSave={onSave} />);
  const textarea = screen.getByPlaceholderText("Enter your preamble template...");
  fireEvent.change(textarea, { target: { value: "New preamble text" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith("New preamble text");
  expect(onClose).toHaveBeenCalledOnce();
});
