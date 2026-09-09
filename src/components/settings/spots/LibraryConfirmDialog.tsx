/**
 * Confirmation built on `AccessibleDialog` rather than the bare `ConfirmDialog`
 * primitive. Every SP-08 preferences surface nests its confirmations inside
 * `SpotsPreferencesPanel`'s own `AccessibleDialog`. `AccessibleDialog`
 * instances register on a shared module-level dialog stack and the outer
 * dialog's Escape listener calls `event.stopImmediatePropagation()` once it
 * confirms it is no longer topmost, so Escape closes only the nested
 * confirmation. `ConfirmDialog`'s own `document`-level Escape listener does
 * not participate in that stack, so a bare `ConfirmDialog` nested here loses
 * the race and the whole preferences panel closes instead.
 */
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

const FOCUS_RING = "focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";
const SECONDARY_BUTTON = `min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-4 py-2 text-sm font-medium text-su-muted transition-colors hover:text-su-text ${FOCUS_RING}`;

export function LibraryConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "destructive",
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning";
}) {
  const confirmClass =
    variant === "destructive"
      ? `min-h-[40px] rounded-lg border border-alert-red/30 bg-alert-red/20 px-4 py-2 text-sm font-medium text-alert-red transition-colors hover:bg-alert-red/30 ${FOCUS_RING}`
      : `min-h-[40px] rounded-lg border border-caution-amber/30 bg-caution-amber/20 px-4 py-2 text-sm font-medium text-caution-amber transition-colors hover:bg-caution-amber/30 ${FOCUS_RING}`;
  return (
    <AccessibleDialog open={open} onClose={onCancel} title={title} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-su-muted">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
