/**
 * #250 S6: a wall report must not clip its own content.
 *
 * jsdom does not layout. Native `scrollHeight` and `clientHeight` are both 0,
 * so comparing them raw would always pass — that is worse than no test.
 *
 * `installReportLayoutStub()` assigns non-zero heights:
 * - `.hcr-body` gets a 1080p-ish slot (`REPORT_BODY_SLOT_PX`).
 * - Each `.hcr-box` content height is `data-overflow-height` or
 *   padding plus a row count. With S6 (`flex: 0 0 auto`) the box slot
 *   equals that content. `boxesShrink: true` is the "revert one
 *   `flex: 0 0 auto`" regression: the box is squeezed and content overflows.
 * - `.hcr-body` scrollHeight is the sum of its children's assigned heights
 *   (fixed children keep content height; a tab/chart remainder is a
 *   small flex slot).
 *
 * A pass is only meaningful under this stub. It does not prove browser flex.
 */
import { within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { vi } from "vitest";

export const REPORT_BODY_SLOT_PX = 700;
const SQUEEZED_BOX_PX = 48;
const ROW_PX = 22;
const BOX_PAD_PX = 36;
const FLEX_REMAINDER_PX = 80;
const TABLIST_PX = 44;

/** Every class this stub knows how to assign a content height to. */
const MEASURABLE_SELECTOR =
  ".hcr-box, .hcr-cols, .hcr-note, .hcr-enginestrip, .hcr-kv, .hcr-bar";

export type ReportLayoutStubOptions = {
  /** Simulate reverting `.hcr-body > .hcr-box { flex: 0 0 auto }`. */
  boxesShrink?: boolean;
  bodySlot?: number;
};

function isBody(el: HTMLElement): boolean {
  return el.classList.contains("hcr-body");
}

function isBox(el: HTMLElement): boolean {
  return el.classList.contains("hcr-box");
}

/**
 * A slot the stylesheet gives `flex: 1 1 auto` inside the body or a tab
 * panel (`.hcr-cols--fill`, `.hcr-box--fill`, `.hcr-chart`). It is sized by
 * what is left over and its content shrinks with it, so it contributes the
 * flex remainder rather than its natural content height — counting the
 * natural height here would report clipping the browser never produces.
 */
function isFlexibleSlot(el: HTMLElement): boolean {
  return (
    el.classList.contains("hcr-cols--fill") ||
    el.classList.contains("hcr-box--fill") ||
    el.classList.contains("hcr-chart")
  );
}

function isFixedChild(el: HTMLElement): boolean {
  return (
    isBox(el) ||
    el.classList.contains("hcr-cols") ||
    el.classList.contains("hcr-note") ||
    el.classList.contains("hcr-enginestrip") ||
    el.classList.contains("hcr-kv") ||
    el.classList.contains("hcr-bar")
  );
}

function measurableRows(el: HTMLElement): number {
  return Math.max(
    1,
    el.querySelectorAll("dt, li, tr, p, button, .hcr-note").length,
  );
}

/**
 * The measurable nodes inside `el` that no *other* measurable node inside
 * `el` already contains — so a wrapper (`.hcc-tabs`, `.hcc-tabpanel`, a plain
 * layout `div`) is measured by what it actually holds instead of falling
 * through to `FLEX_REMAINDER_PX` and hiding its content from the body sum.
 */
function topLevelMeasurables(el: HTMLElement): HTMLElement[] {
  return Array.from(
    el.querySelectorAll<HTMLElement>(MEASURABLE_SELECTOR),
  ).filter((node) => {
    const ancestor =
      node.parentElement?.closest<HTMLElement>(MEASURABLE_SELECTOR);
    return !ancestor || ancestor === el || !el.contains(ancestor);
  });
}

function contentHeight(el: HTMLElement): number {
  const explicit = el.dataset.overflowHeight;
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n)) return n;
  }
  return BOX_PAD_PX + measurableRows(el) * ROW_PX;
}

function childHeight(el: HTMLElement, boxesShrink: boolean): number {
  if (isFlexibleSlot(el)) return FLEX_REMAINDER_PX;
  if (isBox(el)) {
    return boxesShrink ? SQUEEZED_BOX_PX : contentHeight(el);
  }
  if (el.classList.contains("hcr-cols")) {
    return topLevelMeasurables(el).reduce(
      (sum, box) => sum + childHeight(box, boxesShrink),
      0,
    );
  }
  if (isFixedChild(el)) return contentHeight(el);
  // A wrapper the stub has no rule for — most importantly `.hcc-tabs`, whose
  // mounted `.hcc-tabpanel` holds the boxes of the active tab. Measure what
  // it holds; only a genuinely empty flex slot keeps the fixed remainder.
  const held = topLevelMeasurables(el);
  if (held.length === 0) return FLEX_REMAINDER_PX;
  const chrome = el.querySelector(":scope > .hcc-tablist") ? TABLIST_PX : 0;
  return (
    chrome + held.reduce((sum, kid) => sum + childHeight(kid, boxesShrink), 0)
  );
}

export function installReportLayoutStub(
  options: ReportLayoutStubOptions = {},
): () => void {
  const bodySlot = options.bodySlot ?? REPORT_BODY_SLOT_PX;
  const boxesShrink = options.boxesShrink ?? false;
  const assigned = new WeakMap<
    HTMLElement,
    { client: number; scroll: number }
  >();

  function sizes(el: HTMLElement): { client: number; scroll: number } {
    const cached = assigned.get(el);
    if (cached) return cached;
    let client = 0;
    let scroll = 0;
    if (isBox(el)) {
      scroll = contentHeight(el);
      client = boxesShrink ? SQUEEZED_BOX_PX : scroll;
    } else if (isBody(el)) {
      client = bodySlot;
      scroll = Array.from(el.children).reduce((sum, kid) => {
        if (!(kid instanceof HTMLElement)) return sum;
        return sum + childHeight(kid, boxesShrink);
      }, 0);
    }
    const next = { client, scroll };
    assigned.set(el, next);
    return next;
  }

  const clientSpy = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      if (isBody(this) || isBox(this)) return sizes(this).client;
      return 0;
    });
  const scrollSpy = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      if (isBody(this) || isBox(this)) return sizes(this).scroll;
      return 0;
    });

  return () => {
    clientSpy.mockRestore();
    scrollSpy.mockRestore();
  };
}

export function assertReportDoesNotOverflow(
  root: ParentNode,
  reportName: string,
): void {
  const body = root.querySelector(".hcr-body");
  if (!(body instanceof HTMLElement)) {
    throw new Error(`${reportName}: missing .hcr-body`);
  }
  checkSlot(body, reportName, ".hcr-body");
  root.querySelectorAll(".hcr-box").forEach((box, index) => {
    if (box instanceof HTMLElement) {
      checkSlot(box, reportName, `.hcr-box[${index}]`);
    }
  });
}

/** Install the jsdom layout stub, run `run`, then restore the spies. */
export function withReportLayout(run: () => void): void {
  const restore = installReportLayoutStub();
  try {
    run();
  } finally {
    restore();
  }
}

function checkSlot(el: HTMLElement, reportName: string, kind: string): void {
  const client = el.clientHeight;
  const scroll = el.scrollHeight;
  if (client === 0 && scroll === 0) {
    throw new Error(
      `${reportName}: ${kind} has no layout (scrollHeight and clientHeight are 0)`,
    );
  }
  if (scroll > client) {
    throw new Error(
      `${reportName}: ${kind} overflows (${scroll}px content > ${client}px slot)`,
    );
  }
}

/**
 * `HamClockTabs` mounts only the active panel, so a single render proves
 * nothing about the other tabs. Select each enabled tab in turn and assert
 * the report fits with that panel mounted.
 */
export async function assertEveryTabDoesNotOverflow(
  dialog: HTMLElement,
  reportName: string,
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const tabs = within(dialog).queryAllByRole("tab");
  if (tabs.length === 0) {
    withReportLayout(() => assertReportDoesNotOverflow(dialog, reportName));
    return;
  }
  for (const tab of tabs) {
    if (tab.getAttribute("aria-disabled") === "true") continue;
    if (tab instanceof HTMLButtonElement && tab.disabled) continue;
    await user.click(tab);
    withReportLayout(() =>
      assertReportDoesNotOverflow(
        dialog,
        `${reportName} · ${tab.textContent?.trim() ?? "tab"}`,
      ),
    );
  }
}
