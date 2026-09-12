import type { ReactNode } from "react";

/** FAQ / collapsible item */
export function FAQItem({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex items-center gap-3 cursor-pointer list-none text-sm font-medium text-su-text/80 hover:text-su-text transition-colors py-3 px-4 rounded-xl bg-su-line/10 border border-su-line/20 hover:border-su-line/40">
        <svg
          className="w-4 h-4 shrink-0 text-su-muted transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {question}
      </summary>
      <div className="text-sm text-su-muted leading-relaxed pl-7 pr-4 pb-3 pt-1">
        {children}
      </div>
    </details>
  );
}
