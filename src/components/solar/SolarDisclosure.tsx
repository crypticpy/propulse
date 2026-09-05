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
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={onToggle}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/[0.035] sm:px-5"
      >
        <span>
          <span className="block font-orbitron text-sm font-bold text-white sm:text-base">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500 sm:text-sm">{summary}</span>
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div id={`${id}-content`} className="border-t border-white/[0.07] p-3 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}
