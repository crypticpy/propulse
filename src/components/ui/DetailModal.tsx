import { useEffect } from "react";
import { Card } from "./Card";

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg" | "xl" | "full";
  children: React.ReactNode;
}

// Full class names for Tailwind JIT detection
const sizeClasses: Record<NonNullable<DetailModalProps["size"]>, string> = {
  md: "md:max-w-md",
  lg: "md:max-w-2xl",
  xl: "md:max-w-4xl",
  full: "md:max-w-6xl",
};

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
  children,
}: DetailModalProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      {/* Backdrop - pure black for maximum contrast */}
      <div className="absolute inset-0 bg-black/95" onClick={onClose} />

      {/* Modal - pure black background, constrained to viewport */}
      <Card
        className={`
          relative z-10 w-full p-6 flex flex-col
          max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-3rem)]
          max-md:max-w-none max-md:rounded-none
          ${sizeClasses[size]}
          !bg-black !backdrop-blur-none
        `}
        animate
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-shrink-0">
          <div>
            <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-4"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 min-h-0 -mx-6 px-6">
          {children}
        </div>
      </Card>
    </div>
  );
}

export default DetailModal;
