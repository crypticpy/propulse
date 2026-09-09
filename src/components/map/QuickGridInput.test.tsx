import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QuickGridInput } from "./QuickGridInput";

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<QuickGridInput isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Quick Grid Input" });
  const heading = screen.getByRole("heading", { name: "Quick Grid Input" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Quick Grid Input" }),
  ).toHaveLength(1);
});

it("wires the subtitle as aria-describedby (#773)", () => {
  render(<QuickGridInput isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Quick Grid Input" });
  const describedBy = panel.getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();
  expect(document.getElementById(describedBy as string)?.textContent).toBe(
    "Enter a Maidenhead grid locator",
  );
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<QuickGridInput isOpen onClose={onClose} onSubmit={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Quick Grid Input" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("focuses the grid input, not AccessibleDialog's default focus target, after both the rAF and the 50ms timeout have run", () => {
  vi.useFakeTimers();
  render(<QuickGridInput isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);
  const input = screen.getByPlaceholderText("CN87ml");
  act(() => {
    vi.advanceTimersByTime(60);
  });
  expect(document.activeElement).toBe(input);
});

it("still submits on Enter after the migration (Escape branch removed, Enter branch kept)", () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(<QuickGridInput isOpen onClose={onClose} onSubmit={onSubmit} />);
  const input = screen.getByPlaceholderText("CN87ml");
  fireEvent.change(input, { target: { value: "em10" } });
  fireEvent.keyDown(document, { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit.mock.calls[0][0]).toBe("EM10");
  expect(onClose).toHaveBeenCalledOnce();
});
