import { AccessibleDialog } from "./AccessibleDialog";

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg" | "xl" | "full";
  /** Optional z-index override for nested modals */
  zIndexClassName?: string;
  children: React.ReactNode;
}

/**
 * DetailModal - A reusable modal component for displaying expanded content
 *
 * Used for expanding KPI cards and charts to show detailed information.
 * Full-screen on mobile, max-width variants on desktop.
 *
 * @example
 * ```tsx
 * <DetailModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Solar Flux Index"
 *   subtitle="Detailed breakdown"
 *   size="lg"
 * >
 *   <p>Modal content here...</p>
 * </DetailModal>
 * ```
 */
export function DetailModal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "md",
  zIndexClassName,
  children,
}: DetailModalProps) {
  return (
    <AccessibleDialog
      open={isOpen}
      onClose={onClose}
      title={title}
      description={subtitle}
      size={size}
      zIndexClassName={zIndexClassName ?? "z-[350]"}
    >
      {children}
    </AccessibleDialog>
  );
}

export default DetailModal;
