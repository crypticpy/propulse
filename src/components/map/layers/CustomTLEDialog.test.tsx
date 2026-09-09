import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CustomTLEDialog } from "./CustomTLEDialog";

const importFromText = vi.fn();

vi.mock("@/stores/customTLEStore", () => ({
  useCustomTLEStore: (selector: (state: { importFromText: () => number }) => unknown) =>
    selector({ importFromText }),
}));

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<CustomTLEDialog isOpen onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Import Custom TLEs" });
  const heading = screen.getByRole("heading", { name: "Import Custom TLEs" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Import Custom TLEs" }),
  ).toHaveLength(1);
});

it("names the dialog by its visible heading, not the old aria-label text (#773)", () => {
  // Before the migration this panel's accessible name came from
  // aria-label="Import custom TLE data", which didn't match the visible
  // "Import Custom TLEs" heading (WCAG 2.5.3). labelledBy fixes that.
  render(<CustomTLEDialog isOpen onClose={vi.fn()} />);
  expect(
    screen.queryByRole("dialog", { name: "Import custom TLE data" }),
  ).toBeNull();
  expect(
    screen.getByRole("dialog", { name: "Import Custom TLEs" }),
  ).toBeTruthy();
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<CustomTLEDialog isOpen onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "Import Custom TLEs" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("focuses the TLE textarea, not AccessibleDialog's default focus target, after both the rAF and the 100ms timeout have run", () => {
  vi.useFakeTimers();
  render(<CustomTLEDialog isOpen onClose={vi.fn()} />);
  const textarea = screen.getByLabelText("TLE Data");
  act(() => {
    vi.advanceTimersByTime(110);
  });
  expect(document.activeElement).toBe(textarea);
});

it("renders nothing when not open", () => {
  render(<CustomTLEDialog isOpen={false} onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});
