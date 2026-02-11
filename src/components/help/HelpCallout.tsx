/**
 * HelpCallout — Styled callout boxes for tips, notes, warnings, and pro features.
 */

import type { ReactNode } from "react";

type CalloutType = "tip" | "note" | "warning" | "pro";

interface HelpCalloutProps {
  type: CalloutType;
  children: ReactNode;
}

const CALLOUT_STYLES: Record<
  CalloutType,
  { border: string; bg: string; iconColor: string; label: string }
> = {
  tip: {
    border: "border-l-teal-400",
    bg: "bg-teal-400/10",
    iconColor: "text-teal-400",
    label: "Tip",
  },
  note: {
    border: "border-l-blue-400",
    bg: "bg-blue-400/10",
    iconColor: "text-blue-400",
    label: "Note",
  },
  warning: {
    border: "border-l-amber-400",
    bg: "bg-amber-400/10",
    iconColor: "text-amber-400",
    label: "Warning",
  },
  pro: {
    border: "border-l-purple-400",
    bg: "bg-purple-400/10",
    iconColor: "text-purple-400",
    label: "Pro",
  },
};

function CalloutIcon({ type }: { type: CalloutType }) {
  const cls = "w-4 h-4 flex-shrink-0";
  switch (type) {
    case "tip":
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
          />
        </svg>
      );
    case "note":
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
          />
        </svg>
      );
    case "warning":
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      );
    case "pro":
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
          />
        </svg>
      );
  }
}

export function HelpCallout({ type, children }: HelpCalloutProps) {
  const styles = CALLOUT_STYLES[type];

  return (
    <div
      className={`${styles.bg} ${styles.border} border-l-4 rounded-r-lg px-4 py-3 my-3`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`${styles.iconColor} mt-0.5`}>
          <CalloutIcon type={type} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${styles.iconColor}`}
            >
              {styles.label}
            </span>
            {type === "pro" && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-400/20 text-purple-300 rounded">
                PRO
              </span>
            )}
          </div>
          <div className="text-sm text-gray-300 leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
