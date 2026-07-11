/**
 * OnboardingWizard Component
 * Full-screen modal wizard for first-time user onboarding
 */

import { useState, useCallback } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { LocationStep } from "./LocationStep";
import { ExperienceStep } from "./ExperienceStep";
import { TourStep } from "./TourStep";
import { useUserStore } from "@/stores/userStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import type { ExperienceLevel, UIMode } from "@/types/user";

type WizardStep = "welcome" | "location" | "experience" | "tour";

const STEPS: WizardStep[] = ["welcome", "location", "experience", "tour"];

/**
 * Full-screen onboarding wizard for first-time users
 */
export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");

  // Local state for wizard data
  const [callsign, setCallsign] = useState("");
  const [grid, setGrid] = useState("");
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>("intermediate");
  const [uiMode, setUIMode] = useState<UIMode>("normal");

  // Store actions
  const setStation = useUserStore((state) => state.setStation);
  const setStoreExperienceLevel = useUserStore(
    (state) => state.setExperienceLevel,
  );
  const setStoreUIMode = useUserStore((state) => state.setUIMode);
  const setHasCompletedOnboarding = useUserStore(
    (state) => state.setHasCompletedOnboarding,
  );

  const currentStepIndex = STEPS.indexOf(currentStep);

  // Navigation
  const goToNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  }, [currentStepIndex]);

  const goToPrevious = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  }, [currentStepIndex]);

  // Handle experience level change
  const handleExperienceLevelChange = useCallback(
    (level: ExperienceLevel, mode: UIMode) => {
      setExperienceLevel(level);
      setUIMode(mode);
    },
    [],
  );

  // Complete onboarding and save all settings
  const completeOnboarding = useCallback(() => {
    // Save station if grid is valid
    if (grid && isValidGrid(grid)) {
      const coords = gridToLatLon(grid);
      setStation({
        callsign: callsign || "OPERATOR",
        grid,
        lat: coords.lat,
        lon: coords.lon,
        name: "Home",
      });
    }

    // Save experience level and UI mode
    setStoreExperienceLevel(experienceLevel);
    setStoreUIMode(uiMode);

    // Mark onboarding as complete
    setHasCompletedOnboarding(true);
  }, [
    grid,
    callsign,
    experienceLevel,
    uiMode,
    setStation,
    setStoreExperienceLevel,
    setStoreUIMode,
    setHasCompletedOnboarding,
  ]);

  // Skip onboarding
  const skipOnboarding = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, [setHasCompletedOnboarding]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* Starfield background effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-plasma-orange/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cosmic-cyan/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-aurora-purple/5 rounded-full blur-3xl" />
      </div>

      {/* Main wizard card */}
      <div className="relative w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            return (
              <div
                key={step}
                className={`
                  h-2 rounded-full transition-all duration-300
                  ${isActive ? "w-8 bg-plasma-orange" : "w-2"}
                  ${isCompleted ? "bg-plasma-orange/60" : ""}
                  ${!isActive && !isCompleted ? "bg-white/20" : ""}
                `}
              />
            );
          })}
        </div>

        {/* Wizard card */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8 shadow-xl">
          {/* Skip button */}
          <button
            onClick={skipOnboarding}
            className="absolute top-4 right-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip setup
          </button>

          {/* Step content */}
          <div className="min-h-[400px]">
            {currentStep === "welcome" && (
              <WelcomeStep
                callsign={callsign}
                onCallsignChange={setCallsign}
                onNext={goToNext}
              />
            )}

            {currentStep === "location" && (
              <LocationStep
                grid={grid}
                onGridChange={setGrid}
                onNext={goToNext}
                onBack={goToPrevious}
              />
            )}

            {currentStep === "experience" && (
              <ExperienceStep
                experienceLevel={experienceLevel}
                onExperienceLevelChange={handleExperienceLevelChange}
                onNext={goToNext}
                onBack={goToPrevious}
              />
            )}

            {currentStep === "tour" && (
              <TourStep onComplete={completeOnboarding} onBack={goToPrevious} />
            )}
          </div>
        </div>

        {/* Step indicator text */}
        <p className="text-center text-xs text-gray-600 mt-4">
          Step {currentStepIndex + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
