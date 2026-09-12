import { useId } from "react";
import {
  stationTreatmentClasses,
  type StationTreatmentTone,
} from "@/lib/themes/treatments";
import { useOptionalStationTheme } from "@/components/station-ui/context";
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

const confirmTones: Record<
  NonNullable<ConfirmDialogProps["variant"]>,
  StationTreatmentTone
> = {
  destructive: "danger",
  warning: "warning",
  default: "accent",
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
  const stationTheme = useOptionalStationTheme();
  return (
    <AccessibleDialog
      open={open}
      onClose={onCancel}
      title={title}
      size="md"
      role="alertdialog"
      describedBy={messageId}
      panelProps={{ style: stationTheme?.tokens }}
    >
      <div className="flex flex-col gap-4">
        <p id={messageId} className="text-sm text-su-muted">
          {message}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${stationTreatmentClasses({ tone: "neutral", treatment: "subtle", interactive: true })}`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${stationTreatmentClasses({ tone: confirmTones[variant], treatment: "subtle", interactive: true })}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

export default ConfirmDialog;
