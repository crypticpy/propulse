/**
 * ChainWarningBanner -- Compact bar rendering chain validation warnings
 * as inline pills with severity-appropriate colors and icons.
 */

import type { ChainWarning } from "@/lib/chainOrdering";

interface ChainWarningBannerProps {
  warnings: ChainWarning[];
}

export function ChainWarningBanner({ warnings }: ChainWarningBannerProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 py-2 bg-panel/30 backdrop-blur-sm border border-white/5 rounded-xl">
      {warnings.map((warning) => (
        <div
          key={warning.code}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
            warning.severity === "warning"
              ? "bg-caution-amber/10 text-caution-amber border border-caution-amber/20"
              : "bg-nebula-blue/10 text-nebula-blue border border-nebula-blue/20"
          }`}
        >
          {/* Icon: triangle for warning, info circle for info */}
          <svg
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {warning.severity === "warning" ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m11.25 11.25.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0Zm-9-3.75h.008v.008H12V8.25Z"
              />
            )}
          </svg>
          <span>{warning.message}</span>
        </div>
      ))}
    </div>
  );
}
