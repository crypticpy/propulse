import { useEffect } from "react";
import "./workspace-settings.css";
import { useActivePage, useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * The workspace bar's page pager (#657) — replaces `WorkspaceBar`'s earlier
 * static "1 / N" placeholder with a real "◀ TITLE n/N ▶" flip control, plus
 * the auto-page timer. Auto-page itself is configured from `PagesTab`
 * (`setAutoPage`, a plain `{ enabled, dwellSeconds }` on the active
 * workspace, epic #657); this component only ever reads that state to run
 * the timer and never writes it, so there is exactly one place an operator
 * turns it on.
 *
 * Unlike the wall's `autoPage` (`hamclockDisplayStore.ts`), this does not
 * pause on touch/click/key: the workstation canvas is interactive by design
 * (owner rule 5, epic #652 — only the wall is view-only), so pausing on
 * every click an operator makes while working a page would fight the
 * feature rather than serve it. An operator who wants it off turns it off in
 * `PagesTab`.
 */
export function PagePager() {
  const workspace = useActiveWorkspace();
  const page = useActivePage();
  const setActivePage = useWorkspaceStore((s) => s.setActivePage);
  const { pages } = workspace;
  const index = pages.findIndex((p) => p.id === page.id);
  const currentIndex = index === -1 ? 0 : index;

  function step(delta: number) {
    if (pages.length === 0) return;
    const next = pages[(currentIndex + delta + pages.length) % pages.length];
    setActivePage(next.id);
  }

  useEffect(() => {
    if (!workspace.autoPage.enabled || pages.length < 2) return;
    const id = window.setInterval(() => {
      // Read the current page order and active page fresh from the store on
      // every tick, rather than closing over this render's `pages`/
      // `currentIndex`: a reorder that doesn't change the active page's
      // *index* (e.g. [A, B, C] -> [A, C, B] while A is active) wouldn't
      // otherwise re-run this effect, and the interval would keep advancing
      // through the stale order (PR #676 review).
      const state = useWorkspaceStore.getState();
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (!ws || ws.pages.length < 2) return;
      const activeIndex = ws.pages.findIndex((p) => p.id === ws.activePageId);
      const from = activeIndex === -1 ? 0 : activeIndex;
      const next = ws.pages[(from + 1) % ws.pages.length];
      state.setActivePage(next.id);
    }, Math.max(1, workspace.autoPage.dwellSeconds) * 1000);
    return () => window.clearInterval(id);
  }, [workspace.autoPage.enabled, workspace.autoPage.dwellSeconds, pages.length]);

  return (
    <div className="su-inline workspace-pager" aria-label="Page">
      <button
        type="button"
        className="workspace-pager-arrow"
        onClick={() => step(-1)}
        disabled={pages.length < 2}
        aria-label="Previous page"
      >
        ◀
      </button>
      <span className="workspace-pager-title">{page.title.toUpperCase()}</span>
      <span className="su-hint workspace-pager-count">{`${currentIndex + 1} / ${pages.length}`}</span>
      <button
        type="button"
        className="workspace-pager-arrow"
        onClick={() => step(1)}
        disabled={pages.length < 2}
        aria-label="Next page"
      >
        ▶
      </button>
      {workspace.autoPage.enabled && pages.length > 1 && (
        <span className="su-hint workspace-pager-auto" title={`Auto-pages every ${workspace.autoPage.dwellSeconds}s`}>
          AUTO
        </span>
      )}
    </div>
  );
}
