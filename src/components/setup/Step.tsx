import type { ReactNode } from "react";

/** Numbered step heading */
export function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-su-line/20 border border-su-line/40 text-su-text flex items-center justify-center text-sm font-semibold shrink-0">
          {n}
        </div>
        <div className="text-sm font-semibold text-su-text">{title}</div>
      </div>
      <div className="text-sm text-su-muted leading-relaxed pl-9">
        {children}
      </div>
    </div>
  );
}
