import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MapPin } from "../../types/pin";
import { AddPinDialog } from "./AddPinDialog";

const addPin = vi.fn();
const updatePin = vi.fn();

vi.mock("../../stores/pinStore", () => ({
  usePinStore: () => ({ addPin, updatePin }),
}));

const location = { lat: 51.5, lon: -0.1, grid: "IO91wm" };

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(
    <AddPinDialog
      visible
      mode="add"
      location={location}
      onClose={vi.fn()}
    />,
  );
  const panel = screen.getByRole("dialog", { name: "Add Pin" });
  const heading = screen.getByRole("heading", { name: "Add Pin" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(screen.getAllByRole("heading", { name: "Add Pin" })).toHaveLength(1);
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(
    <AddPinDialog
      visible
      mode="add"
      location={location}
      onClose={onClose}
    />,
  );
  const panel = screen.getByRole("dialog", { name: "Add Pin" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("focuses the name input, not AccessibleDialog's default focus target, after both the rAF and the 100ms timeout have run", () => {
  vi.useFakeTimers();
  render(
    <AddPinDialog
      visible
      mode="add"
      location={location}
      onClose={vi.fn()}
    />,
  );
  const nameInput = screen.getByLabelText("Name (optional)");
  act(() => {
    vi.advanceTimersByTime(110);
  });
  expect(document.activeElement).toBe(nameInput);
});

it("still saves a new pin and closes on submit after the migration", () => {
  const newPin = { id: "pin-1", ...location, name: "Test" } as unknown as MapPin;
  addPin.mockReturnValue(newPin);
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <AddPinDialog
      visible
      mode="add"
      location={location}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name (optional)"), {
    target: { value: "Test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Pin" }));
  expect(addPin).toHaveBeenCalledOnce();
  expect(onSave).toHaveBeenCalledWith(newPin);
  expect(onClose).toHaveBeenCalledOnce();
});

it("renders nothing when not visible", () => {
  render(
    <AddPinDialog
      visible={false}
      mode="add"
      location={location}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
