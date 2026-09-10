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
// wall tile's hero digit, a hero stat) — it sets no font-size class of its
// own, and the rule width/padding scale in `em` so they track whatever
// size the parent hero settles on instead of clipping/floating at a fixed
// px size.
const SIZE_STYLES: Record<BandPillSize, string[]> = {
  sm: ["text-xs", "py-0.5", "px-1.5", "border-l-[3px]"],
  md: ["text-sm", "py-1", "px-1.5", "border-l-[3px]"],
  inherit: ["py-[0.15em]", "px-[0.4em]", "border-l-[0.12em]"],
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
 * <TileHero flush><BandPill band={best.band} size="inherit">{best.band.toUpperCase()}</BandPill></TileHero>
 * ```
 */
export const BandPill = forwardRef<HTMLSpanElement, BandPillProps>(
  (
    { band, size = "sm", variant = "chip", className = "", style, children, ...props },
    ref,
  ) => {
    const hue = getBandColor(band);

    const combinedClassName = [
      "inline-flex",
      "items-center",
      "font-mono",
      "rounded-sm",
      "leading-tight",
      "text-su-text",
      ...SIZE_STYLES[size],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const combinedStyle: CSSProperties = {
      ...style,
      borderLeftColor: "var(--band-hue)",
      ...(variant === "chip"
        ? {
            background:
              "color-mix(in srgb, var(--band-hue) 14%, transparent)",
          }
        : {}),
      // Set last so it always reflects this band, even if a caller's
      // `style` prop happened to include the same custom property.
      ["--band-hue" as string]: hue,
    };

    return (
      <span
        ref={ref}
        data-band={band}
        className={combinedClassName}
        style={combinedStyle}
        {...props}
      >
        {children ?? band}
      </span>
    );
  },
);

BandPill.displayName = "BandPill";

export default BandPill;
