import React, { forwardRef } from "react";
import type { CSSProperties } from "react";
import { getBandColor } from "@/lib/utils/spotColors";

export type BandPillSize = "sm" | "md" | "inherit";
export type BandPillVariant = "chip" | "rule";

export interface BandPillProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  band: string;
  size?: BandPillSize;
  variant?: BandPillVariant;
  children?: React.ReactNode;
}

// `inherit` is for a value that already lives inside a sized element (a
// wall tile's hero digit, a hero stat) — it sets no font-size class, no
// font-family/line-height (the parent's face and line-height must win),
// and the rule width/padding scale in `em` so they track whatever size the
// parent settles on instead of clipping/floating at a fixed px size.
const SIZE_TEXT: Record<BandPillSize, string | null> = {
  sm: "text-xs",
  md: "text-sm",
  inherit: null,
};

const SIZE_PADDING_Y: Record<BandPillSize, string> = {
  sm: "py-0.5",
  md: "py-1",
  inherit: "py-[0.15em]",
};

// Chip padding-x is unchanged across sizes. `rule` drops the right side for
// sm/md (dense rows) — `inherit` keeps its em padding either way.
const CHIP_PADDING_X: Record<BandPillSize, string> = {
  sm: "px-1.5",
  md: "px-1.5",
  inherit: "px-[0.4em]",
};

const SIZE_BORDER: Record<BandPillSize, string> = {
  sm: "border-l-[3px]",
  md: "border-l-[3px]",
  inherit: "border-l-[0.12em]",
};

/**
 * BandPill
 *
 * Shared presentation for an amateur radio band label. The band's hue
 * (`getBandColor`) is carried by shape, not ink: a `chip` gets a 3px left
 * rule plus a tint background, a `rule` gets the left rule only (for dense
 * rows). Text is always `text-su-text` — several `BAND_COLORS` values do
 * not clear 4.5:1 on the panel, so the hue never becomes the text colour.
 * Any open/marginal/closed status colour belongs on its own element
 * (a dot, badge, or ring passed via `className`); BandPill never carries it.
 *
 * @example
 * ```tsx
 * <BandPill band="20m" />
 * <BandPill band="40m" variant="rule" size="md" />
 * <BandPill band={second.band} size="sm" className="ring-1 ring-su-info" />
 * <TileHero flush>
 *   <BandPill band={best.band} size="inherit">
 *     {best.band.toUpperCase()}
 *   </BandPill>
 * </TileHero>
 * ```
 */
export const BandPill = forwardRef<HTMLSpanElement, BandPillProps>(
  (
    {
      band,
      size = "sm",
      variant = "chip",
      className = "",
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const hue = getBandColor(band);
    const isInherit = size === "inherit";
    const paddingX =
      variant === "rule" && !isInherit ? "pl-1 pr-0" : CHIP_PADDING_X[size];

    const combinedClassName = [
      "inline-flex",
      "items-center",
      "rounded-sm",
      "text-su-text",
      isInherit ? null : "font-mono",
      isInherit ? null : "leading-tight",
      SIZE_TEXT[size],
      SIZE_PADDING_Y[size],
      paddingX,
      SIZE_BORDER[size],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const combinedStyle: CSSProperties = {
      // Component defaults first, so a caller's `style` can override them.
      borderLeftColor: "var(--band-hue)",
      ...(variant === "chip"
        ? {
            backgroundColor:
              "color-mix(in srgb, var(--band-hue) 14%, transparent)",
          }
        : {}),
      ...style,
      // Set last so it always reflects this band, even if a caller's
      // `style` prop happened to include the same custom property.
      ...({ "--band-hue": hue } as CSSProperties),
    };

    return (
      <span
        ref={ref}
        data-band={band}
        className={combinedClassName}
        style={combinedStyle}
        {...props}
      >
        {children || band}
      </span>
    );
  },
);

BandPill.displayName = "BandPill";

export default BandPill;
