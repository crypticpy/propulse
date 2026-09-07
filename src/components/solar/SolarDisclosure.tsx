import type { ReactNode } from "react";

export type SolarDisclosureAccent = "accent" | "info" | "warning" | "success";

/**
 * Static class map, per tone. Tailwind needs literal class strings — it
 * cannot see through `from-su-${tone}` template interpolation — so every
 * accent gets its own fully-spelled-out entry here rather than being built
 * from the tone name at runtime.
 */
const ACCENT_CLASSES: Record<
  SolarDisclosureAccent,
  { rule: string; hover: string; glyph: string }
> = {
  accent: {
    rule: "bg-gradient-to-r from-su-accent via-su-accent/50 to-transparent",
    hover: "hover:bg-gradient-to-r hover:from-su-accent/15 hover:to-transparent",
    glyph: "border-su-accent/50 text-su-accent",
  },
  info: {
    rule: "bg-gradient-to-r from-su-info via-su-info/50 to-transparent",
    hover: "hover:bg-gradient-to-r hover:from-su-info/15 hover:to-transparent",
    glyph: "border-su-info/50 text-su-info",
  },
  warning: {
    rule: "bg-gradient-to-r from-su-warning via-su-warning/50 to-transparent",
    hover: "hover:bg-gradient-to-r hover:from-su-warning/15 hover:to-transparent",
    glyph: "border-su-warning/50 text-su-warning",
  },
  success: {
    rule: "bg-gradient-to-r from-su-success via-su-success/50 to-transparent",
    hover: "hover:bg-gradient-to-r hover:from-su-success/15 hover:to-transparent",
    glyph: "border-su-success/50 text-su-success",
  },
};

export function SolarDisclosure({
  id,
  title,
  summary,
  open,
  onToggle,
  accent,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  accent: SolarDisclosureAccent;
  children: ReactNode;
}) {
  const { rule, hover, glyph } = ACCENT_CLASSES[accent];
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/70">
      <div aria-hidden="true" className={`h-[3px] w-full ${rule}`} />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={onToggle}
        className={`flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left sm:px-5 ${hover}`}
      >
        <span>
          <span className="block font-orbitron text-sm font-bold text-su-text sm:text-base">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-su-muted/80 sm:text-sm">{summary}</span>
        </span>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-su-input ${glyph}`} aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div id={`${id}-content`} className="border-t border-su-line/20 p-3 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}
