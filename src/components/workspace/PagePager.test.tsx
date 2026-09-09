import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE_ID, useWorkspaceStore } from "@/stores/workspaceStore";
import { PagePager } from "./PagePager";

const originalState = useWorkspaceStore.getState();

describe("PagePager", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(originalState, true);
  });

  it("shows the active page's title and a 1-of-1 count with a single page", () => {
    render(<PagePager />);
    expect(screen.getByText("PAGE 1")).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect((screen.getByLabelText("Previous page") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Next page") as HTMLButtonElement).disabled).toBe(true);
  });

  it("flips forward and back through pages, wrapping at the ends", () => {
    useWorkspaceStore.getState().addPage("Second");
    render(<PagePager />);

    expect(screen.getByText("SECOND")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();

    act(() => screen.getByLabelText("Next page").click());
    expect(useWorkspaceStore.getState().workspaces[0].activePageId).toBe(DEFAULT_PAGE_ID);
    expect(screen.getByText("1 / 2")).toBeTruthy();

    act(() => screen.getByLabelText("Previous page").click());
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  describe("auto-page", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("advances to the next page every dwellSeconds while enabled, and stops once disabled", () => {
      useWorkspaceStore.getState().addPage("Second");
      useWorkspaceStore.getState().setActivePage(DEFAULT_PAGE_ID);
      useWorkspaceStore.getState().setAutoPage({ enabled: true, dwellSeconds: 10 });
      render(<PagePager />);

      expect(useWorkspaceStore.getState().workspaces[0].activePageId).toBe(DEFAULT_PAGE_ID);
      act(() => vi.advanceTimersByTime(10_000));
      expect(useWorkspaceStore.getState().workspaces[0].activePageId).not.toBe(DEFAULT_PAGE_ID);

      act(() => useWorkspaceStore.getState().setAutoPage({ enabled: false, dwellSeconds: 10 }));
      const activeBeforeWait = useWorkspaceStore.getState().workspaces[0].activePageId;
      act(() => vi.advanceTimersByTime(30_000));
      expect(useWorkspaceStore.getState().workspaces[0].activePageId).toBe(activeBeforeWait);
    });

    it("never arms the timer with only one page", () => {
      useWorkspaceStore.getState().setAutoPage({ enabled: true, dwellSeconds: 5 });
      render(<PagePager />);
      act(() => vi.advanceTimersByTime(30_000));
      expect(useWorkspaceStore.getState().workspaces[0].activePageId).toBe(DEFAULT_PAGE_ID);
    });

    it("advances against the current page order after a reorder that doesn't change the active index (PR #676 review)", () => {
      const second = useWorkspaceStore.getState().addPage("Second");
      const third = useWorkspaceStore.getState().addPage("Third");
      if (!second.ok || !third.ok) throw new Error("test setup: addPage failed");
      useWorkspaceStore.getState().setActivePage(DEFAULT_PAGE_ID);
      useWorkspaceStore.getState().setAutoPage({ enabled: true, dwellSeconds: 10 });
      render(<PagePager />);

      // [A, B, C] -> [A, C, B]; A (index 0) stays active, so nothing the
      // effect depends on (enabled/dwellSeconds/pages.length) changes. The
      // timer must still advance to C — A's new neighbour — not the stale B.
      act(() => {
        useWorkspaceStore.getState().movePage(third.pageId, "up");
      });

      act(() => vi.advanceTimersByTime(10_000));
      expect(useWorkspaceStore.getState().workspaces[0].activePageId).toBe(third.pageId);
    });
  });
});
