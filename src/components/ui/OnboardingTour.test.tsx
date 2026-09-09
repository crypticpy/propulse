import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingTour } from "./OnboardingTour";

describe("OnboardingTour", () => {
  it("keeps modal centering on an outer wrapper so fade-in-up does not override it", () => {
    render(
      <OnboardingTour
        isActive
        currentStep={{
          id: "welcome",
          title: "Welcome to Propulse",
          content: "Take a quick tour of the app.",
          isModal: true,
        }}
        stepIndex={0}
        totalSteps={1}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onSkip={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const panel = screen
      .getByRole("heading", { name: "Welcome to Propulse" })
      .closest(".animate-fade-in-up") as HTMLElement | null;

    expect(panel).not.toBeNull();
    expect(panel?.style.transform).toBe("");

    const wrapper = panel?.parentElement as HTMLElement | undefined;
    expect(wrapper?.style.transform).toBe("translate(-50%, -50%)");
    expect(wrapper?.style.top).toBe("50%");
    expect(wrapper?.style.left).toBe("50%");
  });
});
