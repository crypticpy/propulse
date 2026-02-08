/**
 * SetupWizard -- 4-step guided setup for empty shacks.
 *
 * Walks a new user through adding radios, antennas, feedlines, and accessories
 * in order, embedding the appropriate manager component for each step.
 */

import { useState } from "react";
import { useShackStore } from "@/stores/shackStore";
import { RadioManager } from "@/components/settings/RadioManager";
import { AntennaManager } from "@/components/shack/AntennaManager";
import { FeedlineManager } from "@/components/shack/FeedlineManager";
import { AccessoryManager } from "@/components/shack/AccessoryManager";

// ---- Step definitions -------------------------------------------------------

interface WizardStep {
  id: "radios" | "antennas" | "feedlines" | "accessories";
  label: string;
  description: string;
}

const STEPS: WizardStep[] = [
  {
    id: "radios",
    label: "Add Your Radios",
    description: "Start by adding your transceivers",
  },
  {
    id: "antennas",
    label: "Set Up Antennas",
    description: "Add your antenna systems",
  },
  {
    id: "feedlines",
    label: "Connect Feedlines",
    description: "Add coax and transmission lines",
  },
  {
    id: "accessories",
    label: "Add Accessories",
    description: "Amplifiers, tuners, power supplies",
  },
];

// ---- Props ------------------------------------------------------------------

interface SetupWizardProps {
  /** Called when the user finishes or dismisses the wizard */
  onComplete: () => void;
}

// ---- Component --------------------------------------------------------------

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Read counts so user can see progress
  const radioCount = useShackStore((s) => s.radios.length);
  const antennaCount = useShackStore((s) => s.antennas.length);
  const feedlineCount = useShackStore((s) => s.feedlines.length);
  const accessoryCount = useShackStore((s) => s.accessories.length);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  // Step-specific item counts (shown in the progress dots)
  const stepCounts: Record<string, number> = {
    radios: radioCount,
    antennas: antennaCount,
    feedlines: feedlineCount,
    accessories: accessoryCount,
  };

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleSkip = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6 space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-3">
        {STEPS.map((s, i) => {
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          const count = stepCounts[s.id] ?? 0;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setCurrentStep(i)}
              className={`
                relative w-3 h-3 rounded-full transition-all duration-200
                ${
                  isActive
                    ? "bg-plasma-orange scale-125"
                    : isCompleted || count > 0
                      ? "bg-signal-green"
                      : "bg-white/20"
                }
              `}
              aria-label={`Step ${i + 1}: ${s.label}`}
            >
              {count > 0 && !isActive && (
                <span className="absolute -top-3 -right-2 text-[9px] font-bold text-signal-green">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Step header */}
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          Step {currentStep + 1} of {STEPS.length}
        </p>
        <h2 className="text-lg font-semibold text-gray-200">{step.label}</h2>
        <p className="text-sm text-gray-400">{step.description}</p>
      </div>

      {/* Inline manager for current step */}
      <div className="min-h-[200px]">
        {step.id === "radios" && <RadioManager />}
        {step.id === "antennas" && <AntennaManager />}
        {step.id === "feedlines" && <FeedlineManager />}
        {step.id === "accessories" && <AccessoryManager />}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
        <button
          type="button"
          onClick={handleSkip}
          className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors min-h-[44px]"
        >
          Skip
        </button>

        <button
          type="button"
          onClick={handleNext}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-plasma-orange text-white text-sm font-medium hover:bg-plasma-orange/90 transition-colors min-h-[44px]"
        >
          {isLastStep ? "Finish Setup" : "Next Step"}
          {!isLastStep && (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
