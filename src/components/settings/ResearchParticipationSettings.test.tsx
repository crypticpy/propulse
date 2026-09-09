import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useResearchParticipation } from "@/hooks/useResearchParticipation";
import { ResearchParticipationSettings } from "./ResearchParticipationSettings";

vi.mock("@/hooks/useResearchParticipation", () => ({
  useResearchParticipation: vi.fn(),
}));

// #754/#772: the save/withdraw status line sat behind `{status && <p
// role="status">}`, so a save confirmation right after mount had nowhere to
// announce into. It now stays mounted (empty) and the same node picks up
// the confirmation once `saveConsent` resolves — driven through the real
// `save()` handler, not a stub of the region.
it("mounts the status region empty, then mutates the same node once saving research choices resolves", async () => {
  const saveConsent = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useResearchParticipation).mockReturnValue({
    enabled: true,
    authenticated: true,
    state: {
      consent: {
        status: "opted_in",
        allowedUses: ["anonymous_quality_metrics"],
      },
    },
    loading: false,
    error: null,
    canRecordOutcomes: false,
    saveConsent,
    withdrawConsent: vi.fn(),
    startAttempt: vi.fn(),
    completeAttempt: vi.fn(),
    savingConsent: false,
    startingAttempt: false,
    completingAttempt: false,
  } as unknown as ReturnType<typeof useResearchParticipation>);

  render(<ResearchParticipationSettings />);
  const before = screen.getByRole("status");
  expect(before.textContent).toBe("");

  fireEvent.click(
    screen.getByRole("button", { name: "Save Research Choices" }),
  );

  await waitFor(() => expect(saveConsent).toHaveBeenCalled());
  await waitFor(() => {
    const after = screen.getByRole("status");
    expect(after).toBe(before);
    expect(after.textContent).toBe("Research choices saved.");
  });
});
