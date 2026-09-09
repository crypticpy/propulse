import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import {
  AccessibleDialog,
  countDetachedBackgroundStateEntriesForTest,
} from "./AccessibleDialog";

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
  const appRoots: HTMLElement[] = [];
  function appRoot(): HTMLElement {
    const root = document.createElement("div");
    root.id = "app-root";
    root.append(document.createElement("button"));
    document.body.append(root);
    appRoots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of appRoots.splice(0)) root.remove();
  });

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

  it("moves a reopened dialog back to the top so its portal is reachable", () => {
    const root = appRoot();
    const closeA = vi.fn();
    const closeB = vi.fn();
    const renderStack = (aOpen: boolean, bOpen: boolean) => (
      <>
        <AccessibleDialog open={aOpen} onClose={closeA} title="Dialog A">
          <button type="button">A action</button>
        </AccessibleDialog>
        <AccessibleDialog open={bOpen} onClose={closeB} title="Dialog B">
          <button type="button">B action</button>
        </AccessibleDialog>
      </>
    );

    const { rerender } = render(renderStack(true, true));
    rerender(renderStack(false, true));
    rerender(renderStack(true, true));

    const aPortal = screen.getByRole("dialog", { name: "Dialog A" }).parentElement;
    expect(aPortal?.inert).toBeFalsy();
    expect(root.inert).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeB).not.toHaveBeenCalled();
  });

  it("focuses the still-open parent panel when a data-push child closes", () => {
    appRoot();
    const renderStack = (parentOpen: boolean, childOpen: boolean) => (
      <>
        <AccessibleDialog open={parentOpen} onClose={vi.fn()} title="Parent">
          <button type="button">Parent action</button>
        </AccessibleDialog>
        <AccessibleDialog open={childOpen} onClose={vi.fn()} title="Child alert">
          <button type="button">Child action</button>
        </AccessibleDialog>
      </>
    );

    const { rerender } = render(renderStack(true, false));
    document.body.focus();
    rerender(renderStack(true, true));
    rerender(renderStack(true, false));

    const parentDialog = screen.getByRole("dialog", { name: "Parent" });
    expect(parentDialog.contains(document.activeElement)).toBe(true);
  });

  it("drops detached portal nodes from originalBackgroundState under a long-lived dialog", () => {
    appRoot();
    const renderStack = (wallOpen: boolean, transientOpen: boolean) => (
      <>
        <AccessibleDialog open={wallOpen} onClose={vi.fn()} title="Wall report" chrome="bare">
          <div>Wall surface</div>
        </AccessibleDialog>
        <AccessibleDialog open={transientOpen} onClose={vi.fn()} title="Transient">
          <button type="button">Transient action</button>
        </AccessibleDialog>
      </>
    );

    const { rerender } = render(renderStack(true, false));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      rerender(renderStack(true, true));
      rerender(renderStack(true, false));
      expect(countDetachedBackgroundStateEntriesForTest()).toBe(0);
    }
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

  it("falls back to the parent panel when a closing dialog's opener sits in an inerted portal", () => {
    // Simulates a body-portaled popover (LayersPopover, SpotCollectionPopover,
    // EqBandContextMenu): the inner dialog's opener lives outside any
    // AccessibleDialog portal, so the outer dialog's syncBackgroundInert marks
    // it inert while the inner dialog is topmost.
    const popoverPortal = document.createElement("div");
    const innerOpener = document.createElement("button");
    innerOpener.textContent = "Open inner from popover";
    popoverPortal.append(innerOpener);
    document.body.append(popoverPortal);
    innerOpener.focus();

    const renderStack = (outerOpen: boolean, innerOpen: boolean) => (
      <>
        <AccessibleDialog open={outerOpen} onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open={innerOpen} onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>
    );

    const { rerender } = render(renderStack(true, false));
    rerender(renderStack(true, true));

    // jsdom does not reflect the `inert` IDL property to the content
    // attribute the way browsers do, so `closest("[inert]")` would silently
    // miss it if we relied on the property the component just set. Set the
    // attribute explicitly to match real browser behavior.
    popoverPortal.setAttribute("inert", "");

    rerender(renderStack(true, false));

    const outerPanel = screen.getByRole("dialog", { name: "Outer" });
    expect(document.activeElement).toBe(outerPanel);

    popoverPortal.remove();
  });
});

describe("AccessibleDialog late-mounted body portals (#693)", () => {
  // jsdom does not reflect the `inert` IDL property to the content attribute,
  // so assert truthiness on the property (as the rest of this file does) and
  // keep aria-hidden strict via the attribute.
  const lateNodes: HTMLElement[] = [];
  function appendLatePortal(): HTMLElement {
    const node = document.createElement("div");
    node.textContent = "Late portal content";
    document.body.append(node);
    lateNodes.push(node);
    return node;
  }

  afterEach(() => {
    for (const node of lateNodes.splice(0)) node.remove();
  });

  it("inerts a body child that mounts after the dialog is already open", async () => {
    render(
      <AccessibleDialog open onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    const late = appendLatePortal();

    await waitFor(() => expect(late.inert).toBeTruthy());
    expect(late.getAttribute("aria-hidden")).toBe("true");
  });

  it("restores a late-mounted portal instead of leaving it inert once the dialog closes", async () => {
    const { rerender } = render(
      <AccessibleDialog open onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    const late = appendLatePortal();
    await waitFor(() => expect(late.inert).toBeTruthy());

    rerender(
      <AccessibleDialog open={false} onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    expect(late.inert).toBeFalsy();
    expect(late.hasAttribute("aria-hidden")).toBe(false);
  });

  it("stops inerting new body children once the last dialog has closed", async () => {
    // A leaked observer is now independently observable — see "does not
    // treat a body child that arrives while no dialog is open as late"
    // below, which pins it via the lateness state a leaked observer would
    // wrongly attach to a node arriving after the last dialog closed.
    // (The disconnect call itself is also pinned directly by the prototype
    // spy in "disconnects the body observer once the last open dialog
    // closes".)
    //
    // What this test pins, and nothing else does: once
    // `indexOfTopmostOpenEntry()` finds no open entry, a body child that
    // arrives afterward must not be inerted. Regress the cleanup effect's
    // `stackEntry.isOpen = false` write, or regress
    // `indexOfTopmostOpenEntry()` to report a stale `top`, and this goes
    // red.
    const { rerender } = render(
      <AccessibleDialog open onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    rerender(
      <AccessibleDialog open={false} onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    const late = appendLatePortal();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(late.inert).toBeFalsy();
    expect(late.hasAttribute("aria-hidden")).toBe(false);
  });

  it("disconnects the body observer once the last open dialog closes", () => {
    // `disconnectSpy` is a prototype-level spy: it counts every
    // `MutationObserver#disconnect` call in this render tree, not just this
    // module's. `toHaveBeenCalledOnce()` only holds because nothing else
    // here constructs a MutationObserver; it will start over- or
    // under-counting the moment that changes.
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, "disconnect");

    const { rerender } = render(
      <AccessibleDialog open onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );
    expect(disconnectSpy).not.toHaveBeenCalled();

    rerender(
      <AccessibleDialog open={false} onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    expect(disconnectSpy).toHaveBeenCalledOnce();
    disconnectSpy.mockRestore();
  });

  it("does not treat a body child that arrives while no dialog is open as late", async () => {
    // Lateness became state under round 3 (`lateBodyPortals`), so a leaked
    // `bodyPortalObserver` — one that keeps recording arrivals after the
    // last dialog closes instead of disconnecting — is now observable: it
    // would wrongly mark a node that mounted while nothing was open as
    // "late", making the next dialog's foreign-modal exemption match it
    // and leave it reachable behind the modal. This was structurally
    // impossible to catch in round 2, when lateness was purely structural.
    const { rerender } = render(
      <AccessibleDialog open onClose={vi.fn()} title="First">
        <button type="button">First action</button>
      </AccessibleDialog>,
    );
    rerender(
      <AccessibleDialog open={false} onClose={vi.fn()} title="First">
        <button type="button">First action</button>
      </AccessibleDialog>,
    );

    const foreignModal = document.createElement("div");
    foreignModal.innerHTML = '<div role="dialog" aria-modal="true">Foreign modal content</div>';
    document.body.append(foreignModal);
    lateNodes.push(foreignModal);

    render(
      <AccessibleDialog open onClose={vi.fn()} title="Second">
        <button type="button">Second action</button>
      </AccessibleDialog>,
    );

    // One macrotask lets the pending MutationObserver microtask — and the
    // resync it triggers — run, so this asserts the settled state instead of
    // sampling it mid-flight.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(foreignModal.inert).toBeTruthy();
    expect(foreignModal.getAttribute("aria-hidden")).toBe("true");
  });

  it("exempts a foreign modal portal from inert, but still inerts a non-modal late portal", async () => {
    render(
      <AccessibleDialog open onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    const foreignModal = document.createElement("div");
    foreignModal.innerHTML = '<div role="dialog" aria-modal="true">Foreign modal content</div>';
    document.body.append(foreignModal);
    lateNodes.push(foreignModal);

    const nonModal = appendLatePortal();

    await waitFor(() => expect(nonModal.inert).toBeTruthy());
    expect(nonModal.getAttribute("aria-hidden")).toBe("true");
    expect(foreignModal.inert).toBeFalsy();
    expect(foreignModal.hasAttribute("aria-hidden")).toBe(false);
  });

  it("inerts a pre-existing body child with a nested aria-modal descendant (the #root shape)", async () => {
    // RTL's render container is always empty, so no other test in this file
    // can see the bug this regresses: `#root` is a direct body child whose
    // subtree is the whole app, it's mounted long before any dialog opens,
    // and several components render `aria-modal="true"` inline rather than
    // through a body portal. The foreign-modal-exemption check must not
    // match this shape — an ordinary content node that merely predates the
    // dialog and happens to contain unrelated `aria-modal` markup deep
    // inside it — or background inert turns off app-wide the moment one of
    // those inline modals is mounted.
    const appRoot = document.createElement("div");
    appRoot.innerHTML =
      '<div class="app-shell">Ordinary app content' +
      '<div role="dialog" aria-modal="true">Unrelated inline modal</div>' +
      "</div>";
    document.body.append(appRoot);
    lateNodes.push(appRoot);

    render(
      <AccessibleDialog open onClose={vi.fn()} title="Host">
        <button type="button">Host action</button>
      </AccessibleDialog>,
    );

    await waitFor(() => expect(appRoot.inert).toBeTruthy());
    expect(appRoot.getAttribute("aria-hidden")).toBe("true");
  });

  it("still inerts a lower dialog's own portal even though its panel also carries aria-modal", () => {
    const renderStack = (outerOpen: boolean, innerOpen: boolean) => (
      <>
        <AccessibleDialog open={outerOpen} onClose={vi.fn()} title="Outer">
          <button type="button">Outer action</button>
        </AccessibleDialog>
        <AccessibleDialog open={innerOpen} onClose={vi.fn()} title="Inner">
          <button type="button">Inner action</button>
        </AccessibleDialog>
      </>
    );

    const { rerender } = render(renderStack(true, false));
    // Capture the outer portal while it's still reachable — once the inner
    // dialog opens and inerts it, role-based queries can no longer find it.
    const outerPortal = screen.getByRole("dialog", { name: "Outer" }).parentElement;

    rerender(renderStack(true, true));

    expect(outerPortal?.inert).toBeTruthy();
    expect(outerPortal?.getAttribute("aria-hidden")).toBe("true");
  });
});
