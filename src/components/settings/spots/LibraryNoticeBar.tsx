import { LiveRegion } from "@/components/ui/LiveRegion";
import type { LibraryNotice } from "./useSpotsLibrary";

const TONE: Record<LibraryNotice["kind"], string> = {
  saved: "border-signal-green/40 text-signal-green",
  conflict: "border-caution-amber/40 text-caution-amber",
  offline: "border-caution-amber/40 text-caution-amber",
  rejected: "border-alert-red/40 text-alert-red",
};

/** Honest write outcome. A queued or rejected write is never shown as stored. */
export function LibraryNoticeBar({
  notice,
  onDismiss,
}: {
  notice: LibraryNotice | null;
  onDismiss: () => void;
}) {
  return (
    <LiveRegion
      role="status"
      className={`flex items-start justify-between gap-3 rounded-lg border bg-void-black/60 px-3 py-2 text-xs ${notice ? TONE[notice.kind] : ""}`}
    >
      {notice ? (
        <>
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded px-2 py-0.5 text-su-muted hover:text-su-text focus:outline-none focus:ring-2 focus:ring-plasma-orange/60"
          >
            Dismiss
          </button>
        </>
      ) : null}
    </LiveRegion>
  );
}
