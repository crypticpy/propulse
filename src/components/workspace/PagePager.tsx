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
    const id = window.setInterval(() => step(1), Math.max(1, workspace.autoPage.dwellSeconds) * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm on dwell/enabled/page-count change only; `step` closes over live state via `currentIndex`/`pages` each render.
  }, [workspace.autoPage.enabled, workspace.autoPage.dwellSeconds, pages.length, currentIndex]);

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
