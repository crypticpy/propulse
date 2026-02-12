/**
 * OfflineBanner -- Sticky banner shown when operating in offline mode.
 *
 * Displays a caution-amber banner at the top of the viewport with the
 * count of pending mutations waiting to sync. Animates in/out via
 * opacity transition.
 */

import { type FC } from "react";

interface OfflineBannerProps {
  /** Number of pending mutations queued for sync */
  pendingCount: number;
}

const OfflineBanner: FC<OfflineBannerProps> = ({ pendingCount }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 bg-caution-amber/20 border-b border-caution-amber/30 px-4 py-2 transition-opacity duration-300"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-sm text-caution-amber">
        {/* Warning icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>

        <span>
          {pendingCount > 0
            ? `Offline Mode \u2014 ${pendingCount} pending change${pendingCount === 1 ? "" : "s"} will sync when connection returns`
            : "Offline Mode \u2014 All changes saved locally"}
        </span>
      </div>
    </div>
  );
};

export default OfflineBanner;
