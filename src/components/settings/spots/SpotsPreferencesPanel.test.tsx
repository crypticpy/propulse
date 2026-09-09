/**
 * SP-08 panel-level integration: proves the two architectural claims that only
 * hold across real, mounted components rather than the hook in isolation --
 * (1) the quick popover and the detailed panel edit one scoped working copy
 * bound to the surrounding SpotsPreferencesProvider, and (2) two providers
 * bound to two different createTestView() handles never leak into each other.
 *
 * The popover and the panel are never both open at once here: the panel is an
 * AccessibleDialog, which marks every other document.body child `inert` and
 * `aria-hidden="true"` while it is open (see AccessibleDialog.tsx) -- so an
 * open panel would hide the popover's portal from the accessibility tree, and
 * two open panels (two independent AccessibleDialogs) hide *each other*. That
 * mirrors real usage anyway (only one editor surface is visible at a time);
 * what these tests prove is that the underlying working copy -- owned by the
 * provider, not by whichever surface currently renders it -- carries an edit
 * across a close/open swap of either surface, and stays isolated per provider.
 */
import { useRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotsPreferencesPanel } from "./SpotsPreferencesPanel";
import { SpotsPreferencesProvider } from "./SpotsPreferencesProvider";
import { SpotsQuickPopover } from "./SpotsQuickPopover";
import {
  createMemoryLibraryPort,
  createSavedViewFixture,
  createTestView,
  type MemoryLibraryPort,
  type TestViewHandle,
} from "./testing";

function SharedHarness({
  handle,
  library,
  popoverOpen,
  panelOpen,
}: {
  handle: TestViewHandle;
  library: MemoryLibraryPort;
  popoverOpen: boolean;
  panelOpen: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <SpotsPreferencesProvider view={handle.view} library={library}>
      <button ref={triggerRef} type="button">
        Spots preferences trigger
      </button>
      <SpotsQuickPopover
        open={popoverOpen}
        onClose={() => {}}
        triggerRef={triggerRef}
        onOpenAllPreferences={() => {}}
      />
      <SpotsPreferencesPanel open={panelOpen} onClose={() => {}} onLoadView={() => {}} />
    </SpotsPreferencesProvider>
  );
}

function TwoInstances({
  a,
  b,
  aOpen,
  bOpen,
}: {
  a: { handle: TestViewHandle; library: MemoryLibraryPort };
  b: { handle: TestViewHandle; library: MemoryLibraryPort };
  aOpen: boolean;
  bOpen: boolean;
}) {
  return (
    <div>
      <div data-testid="instance-a">
        <SpotsPreferencesProvider view={a.handle.view} library={a.library}>
          <SpotsPreferencesPanel open={aOpen} onClose={() => {}} onLoadView={() => {}} />
        </SpotsPreferencesProvider>
      </div>
      <div data-testid="instance-b">
        <SpotsPreferencesProvider view={b.handle.view} library={b.library}>
          <SpotsPreferencesPanel open={bOpen} onClose={() => {}} onLoadView={() => {}} />
        </SpotsPreferencesProvider>
      </div>
    </div>
  );
}

describe("SpotsPreferencesPanel + SpotsQuickPopover share one scoped working copy (UX-02)", () => {
  // jsdom has no ResizeObserver; the popover uses one to reposition against
  // its trigger. Sibling popover tests (e.g. LayersPopover.test.tsx) stub the
  // same minimal shape.
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("carries a band chosen in the quick popover into the panel's Activity section", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    const library = createMemoryLibraryPort();
    const { rerender } = render(
      <SharedHarness handle={handle} library={library} popoverOpen panelOpen={false} />,
    );

    await user.click(screen.getByRole("button", { name: "20m" }));

    // Same provider, same controller instance: swap which surface is open and
    // the edit the popover made must already be there.
    rerender(<SharedHarness handle={handle} library={library} popoverOpen={false} panelOpen />);

    expect(screen.getByRole("checkbox", { name: "20m" })).toHaveProperty("checked", true);
    handle.dispose();
  });

  it("carries a mode category narrowed in the panel back into the quick popover", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    const library = createMemoryLibraryPort();
    const { rerender } = render(
      <SharedHarness handle={handle} library={library} popoverOpen={false} panelOpen />,
    );

    // Modes start at "All", so every category reads fully selected. Deselecting
    // one explicit member (SSB) of Phone/Voice narrows that category to
    // "partial" -- observable through the popover's category chip, whose
    // aria-pressed is only true for a *fully* selected category.
    await user.click(screen.getByRole("checkbox", { name: "SSB" }));

    rerender(<SharedHarness handle={handle} library={library} popoverOpen panelOpen={false} />);

    // The category chip appends " (some)" once it is no longer fully selected;
    // aria-pressed only ever reads true for a *fully* selected category.
    expect(
      screen.getByRole("button", { name: "Phone / Voice (some)" }).getAttribute("aria-pressed"),
    ).toBe("false");
    handle.dispose();
  });
});

describe("SpotsPreferencesPanel instance isolation", () => {
  it("keeps two provider instances, each bound to its own createTestView(), fully isolated -- including working-status", async () => {
    const user = userEvent.setup();
    const a = { handle: createTestView({ ownerId: "owner-a", slotId: "pane-a" }), library: createMemoryLibraryPort() };
    const b = { handle: createTestView({ ownerId: "owner-b", slotId: "pane-b" }), library: createMemoryLibraryPort() };

    const { rerender } = render(<TwoInstances a={a} b={b} aOpen bOpen={false} />);

    await user.click(screen.getByRole("checkbox", { name: "20m" }));
    expect(screen.getByTestId("working-status").textContent).toBe("Working changes");

    // Close A, open B: B's controller was never touched, so it must show its
    // own untouched default state, not A's edit.
    rerender(<TwoInstances a={a} b={b} aOpen={false} bOpen />);

    expect(screen.getByRole("checkbox", { name: "20m" })).toHaveProperty("checked", false);
    expect(screen.getByTestId("working-status").textContent).toBe("Saved");

    // And A's own edit is still there when we swap back.
    rerender(<TwoInstances a={a} b={b} aOpen bOpen={false} />);
    expect(screen.getByRole("checkbox", { name: "20m" })).toHaveProperty("checked", true);
    expect(screen.getByTestId("working-status").textContent).toBe("Working changes");

    a.handle.dispose();
    b.handle.dispose();
  });
});

describe("SpotsPreferencesPanel section navigation", () => {
  it("switches sections by clicking a tab", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    const library = createMemoryLibraryPort();
    render(
      <SpotsPreferencesProvider view={handle.view} library={library}>
        <SpotsPreferencesPanel open onClose={() => {}} onLoadView={() => {}} />
      </SpotsPreferencesProvider>,
    );

    expect(screen.getByRole("region", { name: "Activity" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Grouping" }));
    expect(screen.getByRole("region", { name: "Report grouping" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Activity" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Paths & Motion" }));
    expect(screen.getByRole("region", { name: "Path shape and motion" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Presets" }));
    expect(screen.getByRole("region", { name: "Presets" })).toBeTruthy();

    handle.dispose();
  });

  it("moves between tabs with ArrowLeft/ArrowRight, wrapping at the ends", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    const library = createMemoryLibraryPort();
    render(
      <SpotsPreferencesProvider view={handle.view} library={library}>
        <SpotsPreferencesPanel open onClose={() => {}} onLoadView={() => {}} />
      </SpotsPreferencesProvider>,
    );

    // AccessibleDialog auto-focuses its header close button via a scheduled
    // requestAnimationFrame on open. Waiting for that focus to land first (as
    // ViewLibrary.test.tsx does) keeps it from stealing focus back from the
    // tab right after we set it.
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Close dialog"),
    );

    const activityTab = screen.getByRole("tab", { name: "Activity" });
    activityTab.focus();
    expect(document.activeElement).toBe(activityTab);

    await user.keyboard("{ArrowRight}");
    const groupingTab = screen.getByRole("tab", { name: "Grouping" });
    expect(document.activeElement).toBe(groupingTab);
    expect(groupingTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "Report grouping" })).toBeTruthy();

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(activityTab);
    expect(activityTab.getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowLeft}");
    const presetsTab = screen.getByRole("tab", { name: "Presets" });
    expect(document.activeElement).toBe(presetsTab);
    expect(presetsTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "Presets" })).toBeTruthy();

    handle.dispose();
  });
});

describe("SpotsPreferencesPanel working-status propagation", () => {
  it("reads Saved before any edit and Working changes after one, through the shared StatusStrip", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    const library = createMemoryLibraryPort();
    const savedView = createSavedViewFixture({ config: handle.runtime.getSnapshot().config });
    render(
      <SpotsPreferencesProvider view={handle.view} library={library} savedView={savedView}>
        <SpotsPreferencesPanel open onClose={() => {}} onLoadView={() => {}} />
      </SpotsPreferencesProvider>,
    );

    expect(screen.getByTestId("working-status").textContent).toBe("Saved");

    await user.click(screen.getByRole("checkbox", { name: "20m" }));

    expect(screen.getByTestId("working-status").textContent).toBe("Working changes");
    handle.dispose();
  });
});
