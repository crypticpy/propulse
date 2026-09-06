/**
 * useOnboardingTour Hook
 *
 * Manages the onboarding tour state for PropSphere.
 * Tracks current step, handles navigation, and persists completion status.
 *
 * Features:
 * - Persists tour completion status to localStorage
 * - Auto-starts for first-time users
 * - Provides methods for tour navigation
 * - Supports restarting the tour from settings/help
 */

import { useState, useCallback, useEffect } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TourStepPosition =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export interface TourStep {
  /** Unique identifier for the step */
  id: string;
  /** Title displayed in the tooltip */
  title: string;
  /** Description/content of the step */
  content: string;
  /** CSS selector or data-tour attribute value to highlight */
  target?: string;
  /** Position of the tooltip relative to the target */
  position?: TourStepPosition;
  /** Whether this step has no target (centered modal) */
  isModal?: boolean;
  /** Optional action to perform when this step is shown */
  onShow?: () => void;
  /** Optional action to perform when leaving this step */
  onHide?: () => void;
}

export interface UseOnboardingTourOptions {
  /** Tour steps configuration */
  steps: TourStep[];
  /** localStorage key for completion status */
  storageKey?: string;
  /** Whether to auto-start for first-time users */
  autoStart?: boolean;
  /** Callback when tour is completed */
  onComplete?: () => void;
  /** Callback when tour is skipped */
  onSkip?: () => void;
}

export interface UseOnboardingTourReturn {
  /** Whether the tour is currently active */
  isActive: boolean;
  /** Current step index (0-based) */
  currentStep: number;
  /** Current step data */
  currentStepData: TourStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Whether the tour has been completed before */
  hasCompleted: boolean;
  /** Start the tour from the beginning */
  startTour: () => void;
  /** Move to the next step */
  nextStep: () => void;
  /** Move to the previous step */
  prevStep: () => void;
  /** Skip/dismiss the tour */
  skipTour: () => void;
  /** Complete the tour (called on last step) */
  completeTour: () => void;
  /** Go to a specific step by index */
  goToStep: (index: number) => void;
  /** Reset completion status (allows tour to auto-start again) */
  resetTourStatus: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_STORAGE_KEY = "propulse-onboarding-completed";

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useOnboardingTour({
  steps,
  storageKey = DEFAULT_STORAGE_KEY,
  autoStart = true,
  onComplete,
  onSkip,
}: UseOnboardingTourOptions): UseOnboardingTourReturn {
  const authInitialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  // Check localStorage for completion status
  const getStoredCompletion = useCallback((): boolean => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  }, [storageKey]);

  // State
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(getStoredCompletion);

  // Wait for session restoration so returning account holders never auto-start.
  useEffect(() => {
    if (
      authInitialized &&
      !isAuthenticated &&
      autoStart &&
      !hasCompleted &&
      steps.length > 0
    ) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setIsActive(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [authInitialized, isAuthenticated, autoStart, hasCompleted, steps.length]);

  // Execute onShow callback when step changes
  useEffect(() => {
    if (isActive && steps[currentStep]?.onShow) {
      steps[currentStep].onShow?.();
    }
  }, [isActive, currentStep, steps]);

  // Start tour
  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  // Next step
  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      // Execute onHide for current step
      steps[currentStep]?.onHide?.();
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, steps]);

  // Previous step
  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      // Execute onHide for current step
      steps[currentStep]?.onHide?.();
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep, steps]);

  // Go to specific step
  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < steps.length) {
        steps[currentStep]?.onHide?.();
        setCurrentStep(index);
      }
    },
    [currentStep, steps],
  );

  // Both skipping and finishing acknowledge the tour for future visits.
  const dismissTour = useCallback(() => {
    steps[currentStep]?.onHide?.();
    setIsActive(false);
    setCurrentStep(0);
    setHasCompleted(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Ignore storage errors
    }

  }, [currentStep, steps, storageKey]);

  const skipTour = useCallback(() => {
    dismissTour();
    onSkip?.();
  }, [dismissTour, onSkip]);

  const completeTour = useCallback(() => {
    dismissTour();
    onComplete?.();
  }, [dismissTour, onComplete]);

  // Reset tour status
  const resetTourStatus = useCallback(() => {
    setHasCompleted(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  // Current step data
  const currentStepData = isActive ? (steps[currentStep] ?? null) : null;

  return {
    isActive,
    currentStep,
    currentStepData,
    totalSteps: steps.length,
    hasCompleted,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
    goToStep,
    resetTourStatus,
  };
}

export default useOnboardingTour;
