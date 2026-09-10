import { useId } from "react";
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
  // Same-hue ink on a same-hue tint fails the 4.5:1 floor once the dialog's
  // own composited surface is accounted for (#827): danger ink on its own
  // /20 tint measures 4.61:1 on Light (a hair above the floor) and warning
  // ink measures 4.22:1 (below it). Keep the tint as the identity cue; draw
  // the label in --su-text, same treatment as Badge's `quiet` variant
  // (#791/#795) and the `default` variant below (#803).
  destructive:
    "bg-alert-red/20 hover:bg-alert-red/30 text-su-text border border-alert-red/30",
  warning:
    "bg-caution-amber/20 hover:bg-caution-amber/30 text-su-text border border-caution-amber/30",
  default:
    "bg-plasma-orange/15 hover:bg-plasma-orange/20 text-su-text border border-plasma-orange/30",
};

/**
 * Built on `AccessibleDialog` (issue #727) rather than a bare `createPortal`,
 * following the precedent set by `LibraryConfirmDialog`. Registering on the
 * shared dialog stack fixes the Escape race where this dialog opened above
 * another `AccessibleDialog` let Escape fall through to the dialog beneath
 * it instead of closing this one.
 *
 * Uses `role="alertdialog"` (#773) since every use of this component is a
 * confirmation the app deliberately interrupts the user's workflow with.
 *
 * One remaining deliberate consequence of the `AccessibleDialog` move, same
 * as `LibraryConfirmDialog` (#605): initial focus lands on `AccessibleDialog`'s
 * own header Close button (the first focusable element in this subtree)
 * instead of the Confirm button. That is arguably safer for a destructive
 * action, since pressing Enter immediately after open no longer confirms.
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
  const messageId = useId();
  return (
    <AccessibleDialog
      open={open}
      onClose={onCancel}
      title={title}
      size="md"
      role="alertdialog"
      describedBy={messageId}
    >
      <div className="flex flex-col gap-4">
        <p id={messageId} className="text-sm text-su-muted">{message}</p>
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
