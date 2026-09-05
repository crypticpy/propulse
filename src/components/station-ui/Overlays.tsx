import { X } from "lucide-react";
import type { ReactNode } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useStationTheme } from "./context";
import { IconButton } from "./Actions";

/** Reuses the app's modal stack, Escape isolation, inert background and focus return. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { theme, density, tokens } = useStationTheme();
  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      chrome="bare"
      panelProps={{
        className: "station-ui su-dialog",
        style: tokens,
        "data-station-theme": theme,
        "data-density": density,
      }}
    >
      <header className="su-dialog-header">
        <div>
          <h2 aria-hidden="true">{title}</h2>
          {description && (
            <p className="su-hint" aria-hidden="true">
              {description}
            </p>
          )}
        </div>
        <IconButton label="Close dialog" onClick={onClose} variant="quiet">
          <X aria-hidden="true" size={20} />
        </IconButton>
      </header>
      <div className="su-dialog-content">{children}</div>
      {footer && <footer className="su-dialog-footer">{footer}</footer>}
    </AccessibleDialog>
  );
}
