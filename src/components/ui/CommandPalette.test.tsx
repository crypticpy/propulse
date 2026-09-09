import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessibleDialog } from "./AccessibleDialog";
import { CommandPalette } from "./CommandPalette";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

// jsdom does not implement scrollIntoView; CommandPalette calls it to keep
// the active option visible, unrelated to this migration.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

describe("CommandPalette", () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it("has exactly one accessible name, supplied by AccessibleDialog's sr-only heading", () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);

    const headings = screen.getAllByRole("heading", { name: "Command Palette" });
    expect(headings).toHaveLength(1);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(headings[0].id);
  });

  it("is a modal dialog that closes via the shared Escape handler", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette isOpen onClose={onClose} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the search input after opening, past both AccessibleDialog's rAF and its own", () => {
    vi.useFakeTimers();
    render(<CommandPalette isOpen onClose={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    const input = screen.getByPlaceholderText("Type a command...");
    expect(document.activeElement).toBe(input);
    vi.useRealTimers();
  });

  it("navigates the option list with arrow keys (kept behavior)", async () => {
    vi.useFakeTimers();
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("Type a command...");
    const options = screen.getAllByRole("option");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[1].getAttribute("aria-selected")).toBe("false");

    await user.type(input, "{ArrowDown}");

    expect(options[0].getAttribute("aria-selected")).toBe("false");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });

  it("Enter executes the active command: navigates and closes (kept behavior)", async () => {
    const onClose = vi.fn();
    vi.useFakeTimers();
    render(<CommandPalette isOpen onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("Type a command...");
    await user.type(input, "{Enter}");

    expect(navigate).toHaveBeenCalledWith("/");
    expect(onClose).toHaveBeenCalled();
  });

  it("traps Tab inside the search input (kept behavior)", async () => {
    vi.useFakeTimers();
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("Type a command...");
    expect(document.activeElement).toBe(input);

    await user.tab();
    expect(document.activeElement).toBe(input);
  });

  it("Escape closes only the topmost dialog when stacked above another AccessibleDialog", async () => {
    const onBackgroundClose = vi.fn();
    const onPaletteClose = vi.fn();
    const user = userEvent.setup();

    render(
      <>
        <AccessibleDialog
          open
          onClose={onBackgroundClose}
          title="Background Dialog"
        >
          <div>Background content</div>
        </AccessibleDialog>
        <CommandPalette isOpen onClose={onPaletteClose} />
      </>,
    );

    await user.keyboard("{Escape}");

    expect(onPaletteClose).toHaveBeenCalledTimes(1);
    expect(onBackgroundClose).not.toHaveBeenCalled();
  });
});
