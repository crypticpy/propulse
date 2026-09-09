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

describe("AccessibleDialog background inerting across a stack", () => {
  // jsdom does not implement the `inert` IDL attribute, so an element this
  // module has never touched reads `undefined` rather than `false`. Assert
  // truthiness for inert and keep aria-hidden strict — that is the claim.
  function appRoot(): HTMLElement {
    const root = document.createElement("div");
    root.id = "app-root";
    root.append(document.createElement("button"));
    document.body.append(root);
    return root;
  }

  it("keeps the page inert when a dialog below the top one closes first", () => {
    const root = appRoot();
    const { rerender } = render(
      <>
        <AccessibleDialog open onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );
    expect(root.inert).toBeTruthy();

    // The outer dialog unmounts while the inner one is still modal.
    rerender(
      <>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );

    expect(root.inert).toBeTruthy();
    expect(root.getAttribute("aria-hidden")).toBe("true");
  });

  it("releases the page once the last dialog closes, even after out-of-order closes", () => {
    const root = appRoot();
    const { rerender } = render(
      <>
        <AccessibleDialog open onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );
    rerender(
      <>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );
    rerender(
      <>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );

    expect(root.inert).toBeFalsy();
    expect(root.hasAttribute("aria-hidden")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("hands the page back to the dialog below when the top one closes", () => {
    const root = appRoot();
    const { rerender } = render(
      <>
        <AccessibleDialog open onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );
    // Captured before the inner dialog hides it: an inerted dialog is
    // aria-hidden, so role queries can no longer reach it.
    const outerPortal = screen.getByRole("dialog", { name: "Outer" }).parentElement;

    rerender(
      <>
        <AccessibleDialog open onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );
    expect(outerPortal?.inert).toBeTruthy();

    rerender(
      <>
        <AccessibleDialog open onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );

    expect(outerPortal?.inert).toBeFalsy();
    expect(root.inert).toBeTruthy();
  });

  it("does not pull focus out of the top dialog when a lower one closes", () => {
    appRoot();
    const { rerender } = render(
      <>
        <AccessibleDialog open onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );
    const innerAction = screen.getByRole("button", { name: "Inner action" });
    innerAction.focus();

    rerender(
      <>
        <AccessibleDialog open={false} onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>,
    );

    expect(document.activeElement).toBe(innerAction);
  });

  it("restores focus to the deepest surviving opener when a top dialog closes after out-of-order lower close", () => {
    const root = appRoot();
    const opener = root.querySelector("button");
    if (!opener) {
      throw new Error("Expected root button");
    }
    opener.focus();

    const renderStack = (outerOpen: boolean, innerOpen: boolean) => (
      <>
        <AccessibleDialog open={outerOpen} onClose={vi.fn()} title="Outer">
          <button type="button">Open inner</button>
        </AccessibleDialog>
        <AccessibleDialog open={innerOpen} onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>
    );

    const { rerender } = render(renderStack(true, false));
    const openInner = screen.getByRole("button", { name: "Open inner" });
    openInner.focus();

    rerender(renderStack(true, true));
    rerender(renderStack(false, true));
    rerender(renderStack(false, false));

    expect(document.activeElement).toBe(opener);
  });
});
