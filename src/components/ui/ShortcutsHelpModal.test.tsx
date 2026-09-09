import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AccessibleDialog } from "./AccessibleDialog";
import { ShortcutsHelpModal } from "./ShortcutsHelpModal";

function renderModal(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ShortcutsHelpModal isOpen onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("ShortcutsHelpModal", () => {
  it("has exactly one accessible name and description, wired to its own visible heading/subtitle", () => {
    renderModal();

    const headings = screen.getAllByRole("heading", {
      name: "Keyboard Shortcuts",
    });
    expect(headings).toHaveLength(1);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(headings[0].id);

    const subtitle = screen.getByText("Quick access to Propulse features");
    expect(dialog.getAttribute("aria-describedby")).toBe(subtitle.id);
  });

  it("is a modal dialog that closes via the shared Escape handler", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ShortcutsHelpModal isOpen onClose={onClose} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the tab row as a tablist in place, with Shortcuts/Reference tabs", () => {
    renderModal();

    const tablist = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tablist.contains(tabs[0])).toBe(true);
    expect(tabs[0].textContent).toBe("Shortcuts");
    expect(tabs[1].textContent).toBe("Reference");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("focuses the header close button after opening, since no override rAF exists (default AccessibleDialog focus)", () => {
    renderModal();

    // No local focus-management effect exists in this component, so the
    // dialog's own AccessibleDialog focus behavior — the first focusable
    // control inside the panel, which is the close button — determines
    // where focus lands. This is a real requestAnimationFrame in jsdom.
    return waitFor(() => {
      const closeButton = screen.getByRole("button", {
        name: "Close shortcuts help",
      });
      expect(document.activeElement).toBe(closeButton);
    });
  });

  it("shows Map shortcuts only on /map, and Contest shortcuts only on /contest (kept route-conditional behavior)", () => {
    renderModal("/map");
    expect(screen.getByText("Map — View Modes")).toBeTruthy();
    expect(screen.queryByText("Contest")).toBeNull();
  });

  it("shows Contest shortcuts on /contest and not Map shortcuts", () => {
    renderModal("/contest");
    expect(screen.getByText("Contest")).toBeTruthy();
    expect(screen.queryByText("Map — View Modes")).toBeNull();
  });

  it("switches to the Reference tab and updates the heading/subtitle (kept behavior)", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("tab", { name: "Reference" }));

    const headings = await screen.findAllByRole("heading", {
      name: "Quick Reference",
    });
    expect(headings).toHaveLength(1);
    expect(
      screen.getByText("Band plan, Q-codes, and CW reference"),
    ).toBeTruthy();
  });

  it("Escape closes only the topmost dialog when stacked above another AccessibleDialog", async () => {
    const onBackgroundClose = vi.fn();
    const onModalClose = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AccessibleDialog
          open
          onClose={onBackgroundClose}
          title="Background Dialog"
        >
          <div>Background content</div>
        </AccessibleDialog>
        <ShortcutsHelpModal isOpen onClose={onModalClose} />
      </MemoryRouter>,
    );

    await user.keyboard("{Escape}");

    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onBackgroundClose).not.toHaveBeenCalled();
  });
});
