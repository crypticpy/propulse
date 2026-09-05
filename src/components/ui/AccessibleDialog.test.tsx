import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { AccessibleDialog } from "./AccessibleDialog";

describe("AccessibleDialog", () => {
  it("moves focus inside, traps Tab, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Open details";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <AccessibleDialog open onClose={close} title="Solar details">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </AccessibleDialog>,
    );

    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close dialog" })));
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close dialog" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    rerender(
      <AccessibleDialog open={false} onClose={close} title="Solar details">
        <button type="button">First action</button>
      </AccessibleDialog>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("keeps Escape from reaching page-level keyboard handlers", () => {
    const pageEscape = vi.fn();
    const close = vi.fn();
    document.addEventListener("keydown", pageEscape);

    const { unmount } = render(
      <AccessibleDialog open onClose={close} title="Spot details">
        <button type="button">Inspect spot</button>
      </AccessibleDialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(close).toHaveBeenCalledOnce();
    expect(pageEscape).not.toHaveBeenCalled();
    unmount();
    document.removeEventListener("keydown", pageEscape);
  });

  it("routes Escape only to the topmost nested dialog", () => {
    const closeOuter = vi.fn();
    const closeOuterAfterRerender = vi.fn();
    const closeInner = vi.fn();
    const { rerender } = render(
      <>
        <AccessibleDialog open onClose={closeOuter} title="Choose radio">
          <button type="button">Manage radios</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={closeInner} title="Add radio">
          <button type="button">Save radio</button>
        </AccessibleDialog>
      </>,
    );

    // Updating only the outer callback must not tear down/re-register its open
    // lifetime and move it above the nested dialog in the module-level stack.
    rerender(
      <>
        <AccessibleDialog
          open
          onClose={closeOuterAfterRerender}
          title="Choose radio"
        >
          <button type="button">Manage radios</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={closeInner} title="Add radio">
          <button type="button">Save radio</button>
        </AccessibleDialog>
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeInner).toHaveBeenCalledOnce();
    expect(closeOuter).not.toHaveBeenCalled();
    expect(closeOuterAfterRerender).not.toHaveBeenCalled();

    rerender(
      <>
        <AccessibleDialog
          open
          onClose={closeOuterAfterRerender}
          title="Choose radio"
        >
          <button type="button">Manage radios</button>
        </AccessibleDialog>
        <AccessibleDialog open={false} onClose={closeInner} title="Add radio">
          <button type="button">Save radio</button>
        </AccessibleDialog>
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeOuterAfterRerender).toHaveBeenCalledOnce();
  });

  it("skips the close when onEscape returns true, but still consumes the keypress (B6 PR #222 fix #2)", () => {
    const close = vi.fn();
    const onEscape = vi.fn(() => true);
    const pageEscape = vi.fn();
    document.addEventListener("keydown", pageEscape);

    render(
      <AccessibleDialog open onClose={close} onEscape={onEscape} title="Guarded">
        <button type="button">Action</button>
      </AccessibleDialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(pageEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", pageEscape);
  });

  it("closes normally when onEscape returns false", () => {
    const close = vi.fn();
    const onEscape = vi.fn(() => false);

    render(
      <AccessibleDialog open onClose={close} onEscape={onEscape} title="Guarded">
        <button type="button">Action</button>
      </AccessibleDialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("has no automated accessibility violations in its rendered contract", async () => {
    render(
      <AccessibleDialog
        open
        onClose={() => {}}
        title="Kp details"
        description="Observed planetary Kp context"
      >
        <button type="button">Inspect source</button>
      </AccessibleDialog>,
    );
    const results = await axe.run(screen.getByRole("dialog"));
    expect(results.violations).toEqual([]);
  });
});
