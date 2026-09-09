import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
}

const confirmStyles: Record<
  NonNullable<ConfirmDialogProps["variant"]>,
  string
> = {
  destructive:
    "bg-alert-red/20 hover:bg-alert-red/30 text-alert-red border border-alert-red/30",
  warning:
    "bg-caution-amber/20 hover:bg-caution-amber/30 text-caution-amber border border-caution-amber/30",
  default:
    "bg-plasma-orange/20 hover:bg-plasma-orange/30 text-plasma-orange border border-plasma-orange/30",
};

/**
 * Built on `AccessibleDialog` (issue #727) rather than a bare `createPortal`,
 * following the precedent set by `LibraryConfirmDialog`. Registering on the
 * shared dialog stack fixes the Escape race where this dialog opened above
 * another `AccessibleDialog` let Escape fall through to the dialog beneath
 * it instead of closing this one.
 *
 * Two deliberate consequences of that move, same as `LibraryConfirmDialog`
 * (#605): the panel role becomes `dialog` instead of `alertdialog` — the
 * wrapper always sets `role="dialog"` and does not expose a way to override
 * it — and initial focus lands on `AccessibleDialog`'s own header Close
 * button (the first focusable element in this subtree) instead of the
 * Confirm button. That is arguably safer for a destructive action, since
 * pressing Enter immediately after open no longer confirms.
 */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "destructive",
}: ConfirmDialogProps) {
  return (
    <AccessibleDialog open={open} onClose={onCancel} title={title} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-su-muted">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                       bg-su-line/10 hover:bg-su-line/20 text-su-muted border border-su-line/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${confirmStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

export default ConfirmDialog;
