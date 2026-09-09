import type { SpotsPreferencesController } from "./types";

const FOLLOW_LABEL: Record<string, string> = {
  off: "Follow radio off",
  active: "Following radio",
  "paused-missing-radio": "Follow radio paused — no radio reporting",
};

/**
 * UX-02: the edit target's name plus whether the working copy differs from the
 * saved record, and the customized/preset label.
 */
export function StatusStrip({ controller }: { controller: SpotsPreferencesController }) {
  const { viewName, status, customization, followStatus } = controller;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-su-muted">
      <span className="font-medium text-su-text">{viewName}</span>
      <span
        data-testid="working-status"
        className={status === "working-changes" ? "text-caution-amber" : "text-signal-green"}
      >
        {status === "working-changes" ? "Working changes" : "Saved"}
      </span>
      {customization.presetName && (
        <span data-testid="preset-status">
          {customization.customized
            ? `${customization.presetName} (customized)`
            : customization.presetName}
        </span>
      )}
      <span data-testid="follow-status">{FOLLOW_LABEL[followStatus]}</span>
    </div>
  );
}
