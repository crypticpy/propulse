import type { ReactNode } from "react";

export function SolarDisclosure({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/70">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={onToggle}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-su-line/10 sm:px-5"
      >
        <span>
          <span className="block font-orbitron text-sm font-bold text-su-text sm:text-base">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-su-muted/80 sm:text-sm">{summary}</span>
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-su-line/40 bg-su-input text-su-muted" aria-hidden="true">
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
