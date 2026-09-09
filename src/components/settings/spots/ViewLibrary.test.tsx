import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SavedView, SaveResult } from "@/lib/views/contracts";
import { ViewLibrary } from "./ViewLibrary";
import { useSpotsPreferences } from "./useSpotsPreferences";
import type { SpotsPreferencesController } from "./types";
import { useSpotsLibrary } from "./useSpotsLibrary";
import {
  createMemoryLibraryPort,
  createSavedViewFixture,
  createTestView,
  type MemoryLibraryPort,
} from "./testing";

/**
 * Mounts a real controller (useSpotsPreferences) over a real scoped view and a
 * real library controller (useSpotsLibrary) over an in-memory port — exactly
 * as the acceptance criteria require. `onController` hands the test the live
 * controller instance so a test can drive a working-copy edit the same way a
 * host section (Activity/Grouping/Paths) would, without ViewLibrary itself
 * needing to expose editing controls it does not own.
 */
function Harness({
  onLoadView,
  savedView = null,
  port,
  onController,
}: {
  onLoadView: (view: SavedView) => void;
  savedView?: SavedView | null;
  port: MemoryLibraryPort;
  onController?: (controller: SpotsPreferencesController) => void;
}) {
  const viewRef = useRef<ReturnType<typeof createTestView> | null>(null);
  if (!viewRef.current) viewRef.current = createTestView();
  const controller = useSpotsPreferences({ view: viewRef.current.view, savedView });
  const library = useSpotsLibrary(port);
  useEffect(() => {
    onController?.(controller);
  });
  return <ViewLibrary controller={controller} library={library} onLoadView={onLoadView} />;
}

async function renderHarness(options: {
  onLoadView?: (view: SavedView) => void;
  savedView?: SavedView | null;
  port?: MemoryLibraryPort;
  onController?: (controller: SpotsPreferencesController) => void;
} = {}) {
  const port = options.port ?? createMemoryLibraryPort();
  const onLoadView = options.onLoadView ?? vi.fn();
  render(
    <Harness
      onLoadView={onLoadView}
      savedView={options.savedView ?? null}
      port={port}
      onController={options.onController}
    />,
  );
  await waitFor(() => expect(screen.queryByText("Loading saved views…")).toBeNull());
  return { port, onLoadView };
}

function viewCalls(port: MemoryLibraryPort) {
  return port.calls.filter((call) => call.kind === "view");
}

/**
 * The name-prompt dialog auto-focuses its header close button on open via a
 * scheduled `requestAnimationFrame` (AccessibleDialog focuses the first
 * focusable element, which precedes the name field). The trigger button that
 * opened the dialog already holds focus the instant it mounts, so waiting
 * for "focus left body" resolves before that rAF runs. Waiting for the
 * dialog's own auto-focus target (the close button) to actually receive
 * focus instead guarantees the rAF has already fired, so it cannot steal
 * focus back out of the name field mid-keystroke (which would land a
 * keystroke on the close button and, on Space, click it shut).
 */
async function fillNameField(user: ReturnType<typeof userEvent.setup>, name: string) {
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close dialog"),
  );
  const input = screen.getByLabelText("View name");
  await user.click(input);
  await user.clear(input);
  await user.type(input, name);
}

describe("ViewLibrary", () => {
  it("marks the loaded record as the current edit target when the provider starts with a saved view", async () => {
    const port = createMemoryLibraryPort();
    const fixture = createSavedViewFixture({ id: "view-a", revision: 2, name: "Started Here" });
    port.seedView(fixture);
    await renderHarness({ port, savedView: fixture });

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Current edit target")).toBeTruthy();
    expect(
      within(row).getByRole("button", { name: "Save changes to Started Here" }),
    ).toBeTruthy();
  });

  it("saves the working copy as a new view at revision 0 and flips status to Saved", async () => {
    const user = userEvent.setup();
    const { port } = await renderHarness();

    await user.click(screen.getByRole("button", { name: "Save as new view" }));
    await fillNameField(user, "My New View");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(viewCalls(port)).toHaveLength(1));
    expect(viewCalls(port)[0]).toEqual(
      expect.objectContaining({ expectedRevision: 0 }),
    );
    await waitFor(() => expect(screen.getByTestId("working-status").textContent).toBe("Saved"));
    expect(screen.getByText("My New View")).toBeTruthy();
  });

  it("saves changes to the current view at its stored revision, incrementing on the next save", async () => {
    const user = userEvent.setup();
    let controller: SpotsPreferencesController | null = null;
    const { port } = await renderHarness({
      onController: (next) => {
        controller = next;
      },
    });

    await user.click(screen.getByRole("button", { name: "Save as new view" }));
    await fillNameField(user, "Iterate Me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("working-status").textContent).toBe("Saved"));
    expect(viewCalls(port)).toHaveLength(1);
    expect(viewCalls(port)[0].expectedRevision).toBe(0);

    // Re-query the row/button fresh before each interaction: every successful
    // write flips `library.loading` true/false (useSpotsLibrary.refresh runs
    // after every commit), which unmounts and remounts the whole row list, so
    // a cached element reference from before a write can go stale.
    function getSaveChangesButton() {
      const row = screen.getByText("Iterate Me").closest("li");
      if (!row) throw new Error("row not found");
      return within(row).getByRole("button", { name: "Save changes to Iterate Me" });
    }

    expect((getSaveChangesButton() as HTMLButtonElement).disabled).toBe(true);

    // Edit the working copy the way a host section would.
    await act(async () => {
      controller!.setFollowRadio(!controller!.config.context.followRadio);
    });
    await waitFor(() =>
      expect(screen.getByTestId("working-status").textContent).toBe("Working changes"),
    );

    await user.click(getSaveChangesButton());
    await waitFor(() => expect(viewCalls(port)).toHaveLength(2));
    expect(viewCalls(port)[1].expectedRevision).toBe(1);
    await waitFor(() => expect(screen.getByTestId("working-status").textContent).toBe("Saved"));

    // A further edit, then a second save-changes, sends the incremented revision.
    await act(async () => {
      controller!.setFollowRadio(!controller!.config.context.followRadio);
    });
    await waitFor(() =>
      expect(screen.getByTestId("working-status").textContent).toBe("Working changes"),
    );
    await user.click(getSaveChangesButton());
    await waitFor(() => expect(viewCalls(port)).toHaveLength(3));
    expect(viewCalls(port)[2].expectedRevision).toBe(2);
  });

  it("renames, duplicates and deletes with the right id and revision; duplicate leaves the original", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    const fixture = createSavedViewFixture({ id: "view-a", revision: 3, name: "Original" });
    port.seedView(fixture);
    await renderHarness({ port });

    await user.click(screen.getByRole("button", { name: "Rename Original" }));
    await fillNameField(user, "Renamed");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() =>
      expect(port.calls).toContainEqual({ kind: "view", id: "view-a", expectedRevision: 3 }),
    );
    await waitFor(() => expect(screen.getByText("Renamed")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Duplicate Renamed" }));
    await fillNameField(user, "Copy of Renamed");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(screen.getByText("Copy of Renamed")).toBeTruthy());
    const duplicateCall = port.calls.find(
      (call) => call.kind === "view" && call.id !== "view-a",
    );
    expect(duplicateCall).toEqual(
      expect.objectContaining({ kind: "view", expectedRevision: 0 }),
    );
    expect(duplicateCall?.id).not.toBe("view-a");
    expect(screen.getByText("Renamed")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete Copy of Renamed" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    // The duplicate was created at expectedRevision 0, which the port stores
    // as revision 1; the refreshed entry (and thus the delete call) reflects
    // that stored revision, not the create-time expectedRevision.
    await waitFor(() =>
      expect(port.calls).toContainEqual(
        expect.objectContaining({ kind: "delete:view", expectedRevision: 1 }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("Copy of Renamed")).toBeNull());
    expect(screen.getByText("Renamed")).toBeTruthy();
  });

  it("does nothing when a delete confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    port.seedView(createSavedViewFixture({ id: "view-a", revision: 1, name: "Keep Me" }));
    await renderHarness({ port });

    await user.click(screen.getByRole("button", { name: "Delete Keep Me" }));
    expect(screen.getByRole("dialog", { name: "Delete saved view" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(port.calls.some((call) => call.kind === "delete:view")).toBe(false);
    expect(screen.getByText("Keep Me")).toBeTruthy();
  });

  it("shows a changed-elsewhere message on conflict, offers a reload, and never marks the working copy saved", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    const conflictView = createSavedViewFixture({ id: "view-a", revision: 5, name: "Conflicted" });
    // MemoryLibraryPort.failNextWith is typed SaveResult<never>, which forces
    // `current: null` for a conflict result. The brief's example passes a
    // real SavedView, so this cast bridges that (see API gap in the report).
    port.failNextWith(
      { status: "conflict", current: conflictView } as unknown as SaveResult<never>,
    );
    let controller: SpotsPreferencesController | null = null;
    await renderHarness({
      port,
      onController: (next) => {
        controller = next;
      },
    });
    // A never-saved working copy trivially reports "Saved"; make a real edit
    // first so there is a working-changes state the failed write must not clear.
    await act(async () => {
      controller!.setFollowRadio(!controller!.config.context.followRadio);
    });
    await waitFor(() =>
      expect(screen.getByTestId("working-status").textContent).toBe("Working changes"),
    );

    await user.click(screen.getByRole("button", { name: "Save as new view" }));
    await fillNameField(user, "Will Conflict");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/changed elsewhere/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Reload the saved view library" })).toBeTruthy();
    expect(screen.getByTestId("working-status").textContent).toBe("Working changes");
    expect(screen.queryByText("Will Conflict")).toBeNull();
  });

  it("shows a not-stored-yet message when a write is queued offline, and never marks the working copy saved", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    port.failNextWith({ status: "pending", operationId: "op-1" });
    let controller: SpotsPreferencesController | null = null;
    await renderHarness({
      port,
      onController: (next) => {
        controller = next;
      },
    });
    await act(async () => {
      controller!.setFollowRadio(!controller!.config.context.followRadio);
    });
    await waitFor(() =>
      expect(screen.getByTestId("working-status").textContent).toBe("Working changes"),
    );

    await user.click(screen.getByRole("button", { name: "Save as new view" }));
    await fillNameField(user, "Will Queue");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/not stored yet/i)).toBeTruthy());
    expect(screen.getByTestId("working-status").textContent).toBe("Working changes");
    expect(screen.queryByText("Will Queue")).toBeNull();
  });

  it("requires confirmation to load a view over unsaved working changes; only confirming loads it", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    const fixture = createSavedViewFixture({ id: "view-a", revision: 1, name: "Loadable" });
    port.seedView(fixture);
    let controller: SpotsPreferencesController | null = null;
    const { onLoadView } = await renderHarness({
      port,
      onController: (next) => {
        controller = next;
      },
    });

    await act(async () => {
      controller!.setFollowRadio(!controller!.config.context.followRadio);
    });
    await waitFor(() =>
      expect(screen.getByTestId("working-status").textContent).toBe("Working changes"),
    );

    await user.click(screen.getByRole("button", { name: "Load Loadable" }));
    expect(screen.getByRole("dialog", { name: "Discard working changes?" })).toBeTruthy();
    expect(onLoadView).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Discard working changes?" })).toBeNull();
    expect(onLoadView).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Load Loadable" }));
    await user.click(screen.getByRole("button", { name: "Load" }));
    expect(onLoadView).toHaveBeenCalledWith(fixture);
  });

  it("loads a view directly, without confirmation, when there are no unsaved working changes", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    const fixture = createSavedViewFixture({ id: "view-a", revision: 1, name: "Loadable" });
    port.seedView(fixture);
    const { onLoadView } = await renderHarness({ port });

    await user.click(screen.getByRole("button", { name: "Load Loadable" }));
    expect(screen.queryByRole("dialog", { name: "Discard working changes?" })).toBeNull();
    expect(onLoadView).toHaveBeenCalledWith(fixture);
  });

  it("gives every row action an accessible name that includes the view name, and stays keyboard operable", async () => {
    const user = userEvent.setup();
    const port = createMemoryLibraryPort();
    port.seedView(createSavedViewFixture({ id: "view-a", revision: 1, name: "Keyboard View" }));
    await renderHarness({ port });

    expect(screen.getByRole("button", { name: "Load Keyboard View" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Duplicate Keyboard View" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename Keyboard View" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Keyboard View" })).toBeTruthy();

    document.body.focus();
    let iterations = 0;
    while (
      document.activeElement?.getAttribute("aria-label") !== "Delete Keyboard View" &&
      iterations < 40
    ) {
      await user.tab();
      iterations += 1;
    }
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Delete Keyboard View");

    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Delete saved view" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Delete saved view" })).toBeNull();
  });

  it("keeps two harnesses behaviourally isolated: saving in one does not touch the other", async () => {
    const user = userEvent.setup();
    const portA = createMemoryLibraryPort();
    const portB = createMemoryLibraryPort();
    const { unmount } = render(<Harness onLoadView={vi.fn()} port={portA} />);
    await waitFor(() => expect(screen.queryByText("Loading saved views…")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Save as new view" }));
    await fillNameField(user, "Only In A");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Only In A")).toBeTruthy());
    unmount();

    render(<Harness onLoadView={vi.fn()} port={portB} />);
    await waitFor(() => expect(screen.queryByText("Loading saved views…")).toBeNull());
    expect(screen.queryByText("Only In A")).toBeNull();
    expect(screen.getByTestId("working-status").textContent).toBe("Saved");
    expect(portB.calls).toHaveLength(0);
  });
});
