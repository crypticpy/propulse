/**
 * ProtocolCheatSheet -- Expandable inline card showing "What to Expect"
 * protocol guide for a net.
 *
 * Collapsed: shows a header row with chevron and title.
 * Expanded: renders protocol notes as pre-wrapped text, with an optional
 * "Newcomer Friendly" badge when the net is newcomer-friendly.
 */

import { useState, useCallback } from "react";

interface ProtocolCheatSheetProps {
  protocolNotes: string;
  newcomerFriendly: boolean;
}

export function ProtocolCheatSheet({
  protocolNotes,
  newcomerFriendly,
}: ProtocolCheatSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-void-black rounded-xl"
      >
        {/* Chevron */}
        <svg
          aria-hidden="true"
          className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-200 ${
            isExpanded ? "rotate-90" : "rotate-0"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>

        <span
          className={`text-sm font-semibold transition-colors ${
            isExpanded
              ? "text-plasma-orange"
              : "text-gray-200 group-hover:text-gray-100"
          }`}
        >
          What to Expect
        </span>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {/* Newcomer Friendly badge */}
          {newcomerFriendly && (
            <div className="inline-flex items-center gap-1.5 bg-signal-green/15 text-signal-green border border-signal-green/30 rounded-full px-2.5 py-1 text-xs font-medium">
              {/* Hand wave icon */}
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z"
                />
              </svg>
              Newcomer Friendly
            </div>
          )}

          {/* Protocol notes */}
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {protocolNotes}
          </p>
        </div>
      )}
    </div>
  );
}
