/**
 * SetupWizard -- 4-step guided setup for empty shacks.
 *
 * Walks a new user through adding radios, antennas, feedlines, and accessories
 * in order, embedding the appropriate manager component for each step.
 */

import { useState } from "react";
import "./setup-wizard.css";
import {
  Button,
  Section,
  StationProvider,
  Surface,
  ActionBar,
} from "@/components/station-ui";
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
    label: "Add Feedlines",
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
    <StationProvider className="station-setup-wizard">
      <Surface>
        <div className="su-stack">
          <Section
            title="Build your equipment inventory"
            description="Start with what you own. Every step is optional, and you can add or change equipment later."
            actions={
              <Button variant="quiet" onClick={onComplete}>
                Finish later
              </Button>
            }
          >
            <nav
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
              aria-label="Shack setup steps"
            >
              {STEPS.map((item, index) => (
                <Button
                  key={item.id}
                  aria-current={index === currentStep ? "step" : undefined}
                  variant={index === currentStep ? "primary" : "secondary"}
                  onClick={() => setCurrentStep(index)}
                >
                  {index + 1}. {item.label} · {stepCounts[item.id]} added
                </Button>
              ))}
            </nav>
          </Section>
          <Section
            title={step.label}
            description={`Step ${currentStep + 1} of ${STEPS.length} · ${step.description}`}
          >
            {step.id === "radios" && <RadioManager />}
            {step.id === "antennas" && <AntennaManager />}
            {step.id === "feedlines" && <FeedlineManager />}
            {step.id === "accessories" && <AccessoryManager />}
          </Section>
          <ActionBar
            leading={
              <p className="su-hint">Equipment is saved as you add it.</p>
            }
          >
            {currentStep > 0 && (
              <Button
                onClick={() => setCurrentStep((previous) => previous - 1)}
              >
                Back
              </Button>
            )}
            <Button variant="quiet" onClick={handleSkip}>
              {isLastStep ? "Skip and finish" : "Skip this step"}
            </Button>
            <Button variant="primary" onClick={handleNext}>
              {isLastStep ? "Finish setup" : "Continue"}
            </Button>
          </ActionBar>
        </div>
      </Surface>
    </StationProvider>
  );
}
