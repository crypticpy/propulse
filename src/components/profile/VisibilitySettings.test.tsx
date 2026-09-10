import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VISIBILITY } from "@/types/social";
import { useProfileStore } from "@/stores/profileStore";
import { VisibilitySettings } from "./VisibilitySettings";

const { isMobileMock, requireAuthMock } = vi.hoisted(() => ({
  isMobileMock: vi.fn(() => false),
  requireAuthMock: vi.fn((callback: () => void) => callback()),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => isMobileMock(),
}));

vi.mock("@/hooks/useRequireAuth", () => ({
  useRequireAuth: () => requireAuthMock,
}));

const originalProfileState = useProfileStore.getState();

function renderVisibilitySettings() {
  return render(<VisibilitySettings />);
}

function statsGroup() {
  return screen.getByRole("radiogroup", { name: "Stats visibility" });
}

describe("VisibilitySettings accessibility (#356)", () => {
  beforeEach(() => {
    isMobileMock.mockReturnValue(false);
    requireAuthMock.mockImplementation((callback: () => void) => callback());
    useProfileStore.setState({
      visibilitySettings: { ...DEFAULT_VISIBILITY },
    });
  });

  afterEach(() => {
    cleanup();
    useProfileStore.setState({
      visibilitySettings: originalProfileState.visibilitySettings,
    });
    isMobileMock.mockReset();
    requireAuthMock.mockReset();
  });

  it("exposes one labelled radiogroup per section with a single checked value", () => {
    renderVisibilitySettings();

    for (const section of ["Stats", "Awards", "Equipment", "Activity", "Location"]) {
      const group = screen.getByRole("radiogroup", {
        name: `${section} visibility`,
      });
      const radios = within(group).getAllByRole("radio");
      expect(radios).toHaveLength(3);
      expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(1);
    }

    expect(
      within(statsGroup()).getByRole("radio", {
        name: "Stats: Public",
        checked: true,
      }),
    ).toBeTruthy();
    expect(
      within(statsGroup()).getByRole("radio", {
        name: "Stats: Friends Only",
        checked: false,
      }),
    ).toBeTruthy();
  });

  it("updates the checked radio after selection and rerender", async () => {
    const user = userEvent.setup();
    renderVisibilitySettings();

    await user.click(
      within(statsGroup()).getByRole("radio", { name: "Stats: Friends Only" }),
    );

    expect(
      within(statsGroup()).getByRole("radio", {
        name: "Stats: Friends Only",
        checked: true,
      }),
    ).toBeTruthy();
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("friends");
  });

  it("moves selection with arrow keys inside a radiogroup", async () => {
    const user = userEvent.setup();
    renderVisibilitySettings();

    const publicRadio = within(statsGroup()).getByRole("radio", {
      name: "Stats: Public",
    });
    publicRadio.focus();
    await user.keyboard("{ArrowRight}");

    expect(
      within(statsGroup()).getByRole("radio", {
        name: "Stats: Friends Only",
        checked: true,
      }),
    ).toBeTruthy();
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("friends");
  });

  it("uses the same radiogroup semantics on mobile", () => {
    isMobileMock.mockReturnValue(true);
    renderVisibilitySettings();

    const group = screen.getByRole("radiogroup", { name: "Stats visibility" });
    expect(
      within(group).getByRole("radio", { name: "Stats: Public", checked: true }),
    ).toBeTruthy();
  });

  it("gates changes behind auth when requireAuth does not run the callback", async () => {
    requireAuthMock.mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderVisibilitySettings();

    await user.click(
      within(statsGroup()).getByRole("radio", { name: "Stats: Private" }),
    );

    expect(requireAuthMock).toHaveBeenCalled();
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("public");
    expect(
      within(statsGroup()).getByRole("radio", {
        name: "Stats: Public",
        checked: true,
      }),
    ).toBeTruthy();
  });
});
