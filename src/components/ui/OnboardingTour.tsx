/**
 * OnboardingTour Component
 *
 * A guided tour overlay that highlights UI elements and provides step-by-step
 * explanations for new users. Features a spotlight effect with smooth transitions
 * and dynamically positioned tooltips.
 *
 * Features:
 * - Spotlight overlay with cutout for highlighted element
 * - Tooltip positioning based on target element location
 * - Next/Previous/Skip navigation
 * - Progress indicator
 * - Smooth animations between steps
 * - Keyboard navigation (Escape to skip, Arrow keys to navigate)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { TourStep, TourStepPosition } from "@/hooks/useOnboardingTour";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingTourProps {
  /** Whether the tour is active */
  isActive: boolean;
  /** Current step data */
  currentStep: TourStep | null;
  /** Current step index (0-based) */
  stepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Go to next step */
  onNext: () => void;
  /** Go to previous step */
  onPrev: () => void;
  /** Skip/dismiss the tour */
  onSkip: () => void;
  /** Complete the tour (on last step) */
  onComplete: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: "top" | "bottom" | "left" | "right";
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 16;
const TOOLTIP_WIDTH = 340;
const ARROW_SIZE = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find target element by selector or data-tour attribute
 */
function findTargetElement(target: string): HTMLElement | null {
  // First try as CSS selector
  let element = document.querySelector(target) as HTMLElement | null;

  // If not found, try as data-tour attribute
  if (!element) {
    element = document.querySelector(
      `[data-tour="${target}"]`,
    ) as HTMLElement | null;
  }

  return element;
}

/**
 * Calculate tooltip position based on target rect and preferred position
 */
function calculateTooltipPosition(
  targetRect: TargetRect,
  preferredPosition: TourStepPosition = "bottom",
): TooltipPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Center of target
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  // Default to preferred position, but adjust if not enough space
  let position = preferredPosition;

  // Check available space in each direction
  const spaceTop = targetRect.top;
  const spaceBottom = viewportHeight - targetRect.bottom;
  const spaceLeft = targetRect.left;
  const spaceRight = viewportWidth - targetRect.right;

  const minSpace = 200; // Minimum space needed for tooltip

  // Adjust position if preferred doesn't fit
  if (position === "bottom" && spaceBottom < minSpace && spaceTop > minSpace) {
    position = "top";
  } else if (
    position === "top" &&
    spaceTop < minSpace &&
    spaceBottom > minSpace
  ) {
    position = "bottom";
  } else if (
    position === "left" &&
    spaceLeft < minSpace &&
    spaceRight > minSpace
  ) {
    position = "right";
  } else if (
    position === "right" &&
    spaceRight < minSpace &&
    spaceLeft > minSpace
  ) {
    position = "left";
  }

  let top = 0;
  let left = 0;
  let arrowPosition: "top" | "bottom" | "left" | "right" = "top";

  switch (position) {
    case "top":
    case "top-left":
    case "top-right":
      top = targetRect.top - TOOLTIP_OFFSET - SPOTLIGHT_PADDING;
      arrowPosition = "bottom";
      break;
    case "bottom":
    case "bottom-left":
    case "bottom-right":
      top = targetRect.bottom + TOOLTIP_OFFSET + SPOTLIGHT_PADDING;
      arrowPosition = "top";
      break;
    case "left":
      top = targetCenterY;
      left =
        targetRect.left - TOOLTIP_WIDTH - TOOLTIP_OFFSET - SPOTLIGHT_PADDING;
      arrowPosition = "right";
      break;
    case "right":
      top = targetCenterY;
      left = targetRect.right + TOOLTIP_OFFSET + SPOTLIGHT_PADDING;
      arrowPosition = "left";
      break;
    case "center":
    default:
      top = viewportHeight / 2;
      left = viewportWidth / 2 - TOOLTIP_WIDTH / 2;
      arrowPosition = "top";
      break;
  }

  // Horizontal positioning for top/bottom positions
  if (["top", "bottom"].includes(position)) {
    left = targetCenterX - TOOLTIP_WIDTH / 2;
  } else if (position === "top-left" || position === "bottom-left") {
    left = targetRect.left;
  } else if (position === "top-right" || position === "bottom-right") {
    left = targetRect.right - TOOLTIP_WIDTH;
  }

  // Clamp to viewport bounds
  left = Math.max(16, Math.min(left, viewportWidth - TOOLTIP_WIDTH - 16));
  top = Math.max(16, Math.min(top, viewportHeight - 200));

  return { top, left, arrowPosition };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spotlight Overlay Component
// ─────────────────────────────────────────────────────────────────────────────

interface SpotlightOverlayProps {
  targetRect: TargetRect | null;
  onClick: () => void;
}

function SpotlightOverlay({ targetRect, onClick }: SpotlightOverlayProps) {
  if (!targetRect) {
    // No target - full overlay for modal steps
    return (
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-all duration-300 cursor-pointer"
        onClick={onClick}
      />
    );
  }

  // Create spotlight effect using box-shadow
  const spotlightStyle: React.CSSProperties = {
    position: "fixed",
    top: targetRect.top - SPOTLIGHT_PADDING,
    left: targetRect.left - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
    borderRadius: "8px",
    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.75)",
    transition: "all 0.3s ease-in-out",
    pointerEvents: "none",
  };

  return (
    <>
      {/* Clickable overlay areas around spotlight */}
      <div
        className="fixed inset-0 cursor-pointer"
        onClick={onClick}
        style={{ zIndex: 1 }}
      />
      {/* Spotlight cutout */}
      <div style={{ ...spotlightStyle, zIndex: 2 }} />
      {/* Highlight ring around target */}
      <div
        className="fixed rounded-lg ring-2 ring-plasma-orange ring-offset-2 ring-offset-transparent animate-pulse pointer-events-none"
        style={{
          top: targetRect.top - SPOTLIGHT_PADDING,
          left: targetRect.left - SPOTLIGHT_PADDING,
          width: targetRect.width + SPOTLIGHT_PADDING * 2,
          height: targetRect.height + SPOTLIGHT_PADDING * 2,
          zIndex: 3,
          transition: "all 0.3s ease-in-out",
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tour Tooltip Component
// ─────────────────────────────────────────────────────────────────────────────

interface TourTooltipProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  position: TooltipPosition;
  isModal: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  position,
  isModal,
  onNext,
  onPrev,
  onSkip,
  onComplete,
}: TourTooltipProps) {
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  // Arrow styles based on position
  const arrowClasses: Record<string, string> = {
    top: "top-0 left-1/2 -translate-x-1/2 -translate-y-full border-l-transparent border-r-transparent border-t-transparent border-b-nebula-blue",
    bottom:
      "bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-l-transparent border-r-transparent border-b-transparent border-t-nebula-blue",
    left: "left-0 top-1/2 -translate-x-full -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-nebula-blue",
    right:
      "right-0 top-1/2 translate-x-full -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-nebula-blue",
  };

  const tooltipStyle: React.CSSProperties = isModal
    ? {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: TOOLTIP_WIDTH,
      }
    : {
        position: "fixed",
        top: position.top,
        left: position.left,
        width: TOOLTIP_WIDTH,
        transform:
          position.arrowPosition === "left" ||
          position.arrowPosition === "right"
            ? "translateY(-50%)"
            : undefined,
      };

  return (
    <div
      className="bg-nebula-blue/95 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl p-5 animate-fade-in-up z-[1000]"
      style={tooltipStyle}
    >
      {/* Arrow (only for non-modal steps) */}
      {!isModal && (
        <div
          className={`absolute w-0 h-0 border-8 ${arrowClasses[position.arrowPosition]}`}
          style={{ borderWidth: ARROW_SIZE }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-lg font-semibold text-white">{step.title}</h3>
        <button
          onClick={onSkip}
          className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors flex-shrink-0"
          aria-label="Skip tour"
        >
          <svg
            className="w-5 h-5"
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

      {/* Content */}
      <p className="text-sm text-gray-300 leading-relaxed mb-4">
        {step.content}
      </p>

      {/* Footer: Progress + Navigation */}
      <div className="flex items-center justify-between">
        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === stepIndex
                    ? "bg-plasma-orange"
                    : i < stepIndex
                      ? "bg-plasma-orange/50"
                      : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <button
              onClick={onPrev}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Back
            </button>
          )}
          {isLastStep ? (
            <button
              onClick={onComplete}
              className="px-4 py-1.5 text-sm font-medium bg-plasma-orange hover:bg-plasma-orange/90 text-white rounded-lg transition-colors"
            >
              Get Started
            </button>
          ) : (
            <button
              onClick={onNext}
              className="px-4 py-1.5 text-sm font-medium bg-plasma-orange hover:bg-plasma-orange/90 text-white rounded-lg transition-colors"
            >
              Next
            </button>
          )}
        </div>
      </div>

      {/* Skip link */}
      {!isLastStep && (
        <div className="mt-3 text-center">
          <button
            onClick={onSkip}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip tour
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingTour({
  isActive,
  currentStep,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onComplete,
}: OnboardingTourProps) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    arrowPosition: "top",
  });
  const observerRef = useRef<ResizeObserver | null>(null);

  // Handle click outside confirmation
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // Update target rect when step changes
  const updateTargetRect = useCallback(() => {
    if (!currentStep?.target) {
      setTargetRect(null);
      return;
    }

    const element = findTargetElement(currentStep.target);
    if (!element) {
      setTargetRect(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const newRect: TargetRect = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      right: rect.right,
    };

    setTargetRect(newRect);
    setTooltipPosition(
      calculateTooltipPosition(newRect, currentStep.position || "bottom"),
    );
  }, [currentStep]);

  // Set up observers and listeners
  useEffect(() => {
    if (!isActive || !currentStep) return;

    // Initial update
    updateTargetRect();

    // Watch for window resize
    const handleResize = () => updateTargetRect();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    // Watch target element for size changes
    if (currentStep.target) {
      const element = findTargetElement(currentStep.target);
      if (element) {
        observerRef.current = new ResizeObserver(updateTargetRect);
        observerRef.current.observe(element);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      observerRef.current?.disconnect();
    };
  }, [isActive, currentStep, updateTargetRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          if (showSkipConfirm) {
            setShowSkipConfirm(false);
          } else {
            setShowSkipConfirm(true);
          }
          break;
        case "ArrowRight":
        case "Enter":
          if (stepIndex < totalSteps - 1) {
            onNext();
          } else {
            onComplete();
          }
          break;
        case "ArrowLeft":
          if (stepIndex > 0) {
            onPrev();
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isActive,
    stepIndex,
    totalSteps,
    onNext,
    onPrev,
    onComplete,
    showSkipConfirm,
  ]);

  // Prevent body scroll while tour is active
  useEffect(() => {
    if (!isActive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isActive]);

  if (!isActive || !currentStep) return null;

  const handleOverlayClick = () => {
    setShowSkipConfirm(true);
  };

  const isModal = currentStep.isModal || !currentStep.target;

  return createPortal(
    <div className="fixed inset-0 z-[400]">
      {/* Spotlight overlay */}
      <SpotlightOverlay targetRect={targetRect} onClick={handleOverlayClick} />

      {/* Tour tooltip */}
      <TourTooltip
        step={currentStep}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        position={tooltipPosition}
        isModal={isModal}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        onComplete={onComplete}
      />

      {/* Skip confirmation modal */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSkipConfirm(false)}
          />
          <div className="relative bg-nebula-blue border border-white/20 rounded-xl p-6 max-w-sm animate-fade-in-up">
            <h4 className="text-lg font-semibold text-white mb-2">
              Skip Tour?
            </h4>
            <p className="text-sm text-gray-300 mb-4">
              Are you sure you want to skip the tour? You can restart it anytime
              from the help menu.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Continue Tour
              </button>
              <button
                onClick={() => {
                  setShowSkipConfirm(false);
                  onSkip();
                }}
                className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

export default OnboardingTour;
