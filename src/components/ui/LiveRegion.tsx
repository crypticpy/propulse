/**
 * LiveRegion - a status/alert region that stays mounted whether or not it
 * currently has content.
 *
 * A live region only announces content that changes *while the region is
 * already in the accessibility tree*. Mounting an element that already has
 * `role="status"` (or `role="alert"`) on it does not announce — the screen
 * reader sees a new node appear, not a mutation inside a region it was
 * watching. The fix is structural: always render the region, and let its
 * children flip between empty and populated.
 *
 * Usage: replace `{cond && <p role="status">{text}</p>}` with
 * `<LiveRegion role="status">{cond ? text : null}</LiveRegion>` — same
 * conditional, but the region element itself never unmounts.
 *
 * `role="status"` (aria-live="polite") is the default; pass `role="alert"`
 * for aria-live="assertive", matching the existing polite/assertive split
 * used across the app rather than inventing a new one.
 *
 * When there is no content, the region renders with no visible layout
 * (`sr-only`) so an empty caption never paints a phantom box.
 */

import type { ElementType, HTMLAttributes, ReactNode } from "react";

export type LiveRegionRole = "status" | "alert";

export interface LiveRegionProps
  extends Omit<HTMLAttributes<HTMLElement>, "role"> {
  /** Host element to render. Defaults to "div". */
  as?: ElementType;
  /** "status" (polite) by default, "alert" (assertive) opt-in. */
  role?: LiveRegionRole;
  children?: ReactNode;
}

const ARIA_LIVE: Record<LiveRegionRole, "polite" | "assertive"> = {
  status: "polite",
  alert: "assertive",
};

function isEmptyContent(children: ReactNode): boolean {
  return children === null || children === undefined || children === "" || children === false;
}

export function LiveRegion({
  as,
  role = "status",
  className = "",
  children,
  ...rest
}: LiveRegionProps) {
  const Component = as ?? "div";
  const empty = isEmptyContent(children);

  return (
    <Component
      role={role}
      aria-live={ARIA_LIVE[role]}
      aria-atomic="true"
      className={empty ? "sr-only" : className}
      {...rest}
    >
      {children}
    </Component>
  );
}
