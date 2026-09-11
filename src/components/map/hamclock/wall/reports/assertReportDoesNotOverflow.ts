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
import { vi } from "vitest";

export const REPORT_BODY_SLOT_PX = 700;
const SQUEEZED_BOX_PX = 48;
const ROW_PX = 22;
const BOX_PAD_PX = 36;
const FLEX_REMAINDER_PX = 80;

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

function contentHeight(el: HTMLElement): number {
  const explicit = el.dataset.overflowHeight;
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n)) return n;
  }
  return BOX_PAD_PX + measurableRows(el) * ROW_PX;
}

function childHeight(
  el: HTMLElement,
  boxesShrink: boolean,
): number {
  if (isBox(el)) {
    return boxesShrink ? SQUEEZED_BOX_PX : contentHeight(el);
  }
  if (el.classList.contains("hcr-cols")) {
    return Array.from(el.querySelectorAll(":scope > .hcr-box")).reduce(
      (sum, box) =>
        sum +
        (box instanceof HTMLElement ? childHeight(box, boxesShrink) : 0),
      0,
    );
  }
  if (isFixedChild(el)) return contentHeight(el);
  return FLEX_REMAINDER_PX;
}

export function installReportLayoutStub(
  options: ReportLayoutStubOptions = {},
): () => void {
  const bodySlot = options.bodySlot ?? REPORT_BODY_SLOT_PX;
  const boxesShrink = options.boxesShrink ?? false;
  const assigned = new WeakMap<HTMLElement, { client: number; scroll: number }>();

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
