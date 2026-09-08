import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

/**
 * Open dialogs in mounting order, with the active/topmost dialog last.
 *
 * Capture-phase listeners are intentionally used to protect modal Escape from
 * page shortcuts. Because the browser invokes older listeners first, each
 * dialog also needs this stack guard: an outer dialog must yield to a nested
 * dialog instead of consuming the keypress and unmounting both.
 */
const openDialogStack: { token: symbol; portalRoot: HTMLElement | null }[] = [];

/**
 * What each background element looked like before this module first hid it.
 *
 * Restoring from a per-dialog snapshot instead would chain: a dialog opened on
 * top of another records the one below as already inert, then re-applies that
 * on close and leaves the page permanently unreachable.
 */
const originalBackgroundState = new Map<
  HTMLElement,
  { inert: boolean; ariaHidden: string | null }
>();
let previousBodyOverflow: string | null = null;

function restoreOriginal(element: HTMLElement): void {
  const original = originalBackgroundState.get(element);
  if (!original) return;
  element.inert = original.inert;
  if (original.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", original.ariaHidden);
}

/**
 * Only the topmost dialog stays reachable; every other body child — including
 * the portals of dialogs and popovers below it — is inert and hidden.
 *
 * Recomputed from the whole stack on every open and close, so a dialog that
 * closes while it is not on top can no longer release the background out from
 * under the dialog that still is.
 */
function syncBackgroundInert(): void {
  const top = openDialogStack[openDialogStack.length - 1];
  if (!top) {
    for (const element of originalBackgroundState.keys()) restoreOriginal(element);
    originalBackgroundState.clear();
    if (previousBodyOverflow !== null) {
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = null;
    }
    return;
  }
  if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!originalBackgroundState.has(child)) {
      originalBackgroundState.set(child, {
        inert: child.inert,
        ariaHidden: child.getAttribute("aria-hidden"),
      });
    }
    if (child === top.portalRoot) {
      restoreOriginal(child);
      continue;
    }
    child.inert = true;
    child.setAttribute("aria-hidden", "true");
  }
}

export interface AccessibleDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Runs before Escape closes the dialog. Returning `true` skips the close —
   * a nested cancelable sub-view (e.g. a settings tab's style chooser) can
   * use this to make Escape cancel itself instead of closing the whole
   * dialog. Escape still never reaches page-level handlers either way.
   */
  onEscape?: () => boolean;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "md" | "lg" | "xl" | "full";
  /** Tailwind z-index class for the portal overlay. */
  zIndexClassName?: string;
  /**
   * `bare` drops the built-in header and scroll body so the caller can draw
   * its own panel (the HamClock wall reports own their whole surface). The
   * title still ships as a visually hidden heading, so the dialog keeps its
   * accessible name either way.
   */
  chrome?: "default" | "bare";
  /**
   * Attributes merged onto the dialog panel before its own: class, style
   * custom properties, `data-*` theme hooks. The panel's role, ARIA wiring
   * and tab index are applied afterwards and always win.
   */
  panelProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
}

const sizes = {
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-6xl",
  full: "max-w-[92vw]",
};

export function AccessibleDialog({
  open,
  onClose,
  onEscape,
  title,
  description,
  children,
  size = "lg",
  zIndexClassName = "z-[500]",
  chrome = "default",
  panelProps,
}: AccessibleDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogTokenRef = useRef(Symbol("AccessibleDialog"));
  // Keep the listener registered for the entire open lifetime even when a
  // parent passes a freshly-created callback on rerender. Re-registering an
  // outer dialog would move it above an already-open nested dialog in both the
  // Escape stack and the inert-background snapshot.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (
        openDialogStack[openDialogStack.length - 1]?.token !== dialogTokenRef.current
      ) {
        return;
      }
      event.preventDefault();
      // A modal owns Escape while it is open. Capture the event before
      // page-level shortcuts (for example FullscreenPropSphere's exit
      // handler) and stop sibling document listeners from acting on the
      // same keypress after the dialog closes.
      event.stopImmediatePropagation();
      if (onEscapeRef.current?.()) return;
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => !element.hasAttribute("hidden") && !element.closest("[hidden]"),
    );
    if (controls.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialogToken = dialogTokenRef.current;
    openerRef.current = document.activeElement as HTMLElement | null;
    openDialogStack.push({
      token: dialogToken,
      portalRoot: dialogRef.current?.parentElement ?? null,
    });
    syncBackgroundInert();
    document.addEventListener("keydown", handleKeyDown, true);
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialogRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const stackIndex = openDialogStack.findIndex((entry) => entry.token === dialogToken);
      const wasTopmost = stackIndex !== -1 && stackIndex === openDialogStack.length - 1;
      if (stackIndex !== -1) openDialogStack.splice(stackIndex, 1);
      syncBackgroundInert();
      // Returning focus from a dialog that was not on top would drag focus out
      // of the dialog that still is.
      if (wasTopmost) openerRef.current?.focus();
    };
  }, [handleKeyDown, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-3 sm:p-6`}>
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Dismiss dialog"
        tabIndex={-1}
      />
      <div
        {...panelProps}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={
          chrome === "bare"
            ? `relative ${panelProps?.className ?? ""}`
            : `relative flex max-h-[calc(100dvh-1.5rem)] w-full ${sizes[size]} flex-col overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/95 shadow-2xl shadow-black/60 ${panelProps?.className ?? ""}`
        }
      >
        {chrome === "bare" ? (
          <>
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="sr-only">
                {description}
              </p>
            )}
            {children}
          </>
        ) : (
          <>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-su-line/40 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={titleId} className="font-orbitron text-lg font-bold text-su-text sm:text-xl">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm leading-6 text-su-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-su-line/40 bg-su-input text-xl text-su-muted transition-colors hover:bg-su-line/20 hover:text-su-text"
                aria-label="Close dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
