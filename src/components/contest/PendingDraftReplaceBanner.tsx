import type { PendingDraftReplace } from "@/stores/contestUIStore";

export interface PendingDraftReplaceBannerProps {
  sessionId: string | null;
  pendingDraftReplace: PendingDraftReplace | null;
  draft: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PendingDraftReplaceBanner({
  sessionId,
  pendingDraftReplace,
  draft,
  onConfirm,
  onCancel,
}: PendingDraftReplaceBannerProps) {
  if (!pendingDraftReplace || pendingDraftReplace.sessionId !== sessionId) {
    return null;
  }

  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-plasma-orange/10 border border-plasma-orange/30 flex items-center gap-3">
      <div className="text-xs text-su-text">
        Replace current draft{" "}
        <span className="font-mono text-su-text">{draft || "(empty)"}</span> with{" "}
        <span className="font-mono text-plasma-orange">
          {pendingDraftReplace.nextText}
        </span>
        ?
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="px-2 py-1 rounded bg-plasma-orange/20 text-su-text border border-plasma-orange/40 hover:bg-plasma-orange/20 transition-colors text-xs font-bold"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 rounded bg-su-line/10 text-su-muted border border-su-line/40 hover:bg-su-line/20 hover:text-su-text transition-colors text-xs"
        >
          Keep
        </button>
      </div>
    </div>
  );
}

export default PendingDraftReplaceBanner;

