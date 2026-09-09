import { OnboardingTour } from "propulse";

// No `target` is set on either step — these are honest "isModal" tour steps
// (no DOM element from the real app exists in this sandboxed card to
// highlight), which is a real, supported OnboardingTour state: welcome and
// closing steps in the actual tour are modal-centered for the same reason.

export function WelcomeStep() {
  return (
    <OnboardingTour
      isActive
      currentStep={{
        id: "welcome",
        title: "Welcome to Propulse",
        content:
          "This quick tour shows you around the globe, the band conditions panel, and where to set your QTH before your first contact.",
        isModal: true,
      }}
      stepIndex={0}
      totalSteps={4}
      onNext={() => {}}
      onPrev={() => {}}
      onSkip={() => {}}
      onComplete={() => {}}
    />
  );
}

export function FinalStep() {
  return (
    <OnboardingTour
      isActive
      currentStep={{
        id: "wrap-up",
        title: "You're ready to operate",
        content:
          "Set your target, watch the band conditions panel, and check the DX cluster for live spots. Restart this tour anytime from the help menu.",
        isModal: true,
      }}
      stepIndex={3}
      totalSteps={4}
      onNext={() => {}}
      onPrev={() => {}}
      onSkip={() => {}}
      onComplete={() => {}}
    />
  );
}
