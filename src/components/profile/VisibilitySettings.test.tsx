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

/** The desktop matrix owns nothing across cells: resolve radios by their row. */
function sectionRow(section: string): HTMLElement {
  const header = screen.getByRole("rowheader", { name: section });
  const row = header.closest("tr");
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

function statsRadio(level: string) {
  return screen.getByRole("radio", { name: `Stats: ${level}` });
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

  it("exposes every desktop choice as a labelled radio with one checked per section", () => {
    renderVisibilitySettings();

    for (const section of [
      "Stats",
      "Awards",
      "Equipment",
      "Activity",
      "Location",
    ]) {
      const radios = within(sectionRow(section)).getAllByRole("radio");
      expect(radios).toHaveLength(3);
      expect(
        radios.filter((radio) => radio.getAttribute("aria-checked") === "true"),
      ).toHaveLength(1);
      for (const level of ["Public", "Friends Only", "Private"]) {
        expect(
          within(sectionRow(section)).getByRole("radio", {
            name: `${section}: ${level}`,
          }),
        ).toBeTruthy();
      }
    }

    expect(statsRadio("Public").getAttribute("aria-checked")).toBe("true");
    expect(statsRadio("Friends Only").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("leaves each desktop radio in the cell under its own column header", () => {
    const { container } = renderVisibilitySettings();

    // `aria-owns` was the only way to span a group across three cells, and it
    // reparents the controls out of them: the column header (Public / Friends
    // Only / Private) association is what pays for it. Nothing may own a
    // control across cells here.
    expect(container.querySelectorAll("[aria-owns]")).toHaveLength(0);

    const columnHeaders = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(columnHeaders).toEqual([
      "Section",
      "Public",
      "Friends Only",
      "Private",
    ]);
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header.getAttribute("scope")).toBe("col");
    }

    const row = sectionRow("Stats");
    const cells = Array.from(row.children);
    for (const [index, level] of [
      "Public",
      "Friends Only",
      "Private",
    ].entries()) {
      const radio = statsRadio(level);
      const cell = radio.closest("td");
      expect(cell).toBeTruthy();
      expect(cell?.parentElement).toBe(row);
      // The control sits in the column its header names: cell 0 is the row
      // header, so the levels start at index 1.
      expect(cells.indexOf(cell as HTMLElement)).toBe(index + 1);
    }
  });

  it("keeps native table row semantics on desktop (no radiogroup on the tr)", () => {
    renderVisibilitySettings();

    // A `role="radiogroup"` on the <tr> would strip the row role and with it
    // the row/column header context for every cell in the matrix.
    const rowHeader = screen.getByRole("rowheader", { name: "Stats" });
    const row = rowHeader.closest("tr");
    expect(row).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(row?.getAttribute("role")).toBeNull();
    expect(screen.getAllByRole("row").includes(row as HTMLElement)).toBe(true);
    expect(statsRadio("Public").closest("td")).toBeTruthy();
  });

  it("updates the checked radio after selection and rerender", async () => {
    const user = userEvent.setup();
    renderVisibilitySettings();

    await user.click(statsRadio("Friends Only"));

    expect(statsRadio("Friends Only").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("friends");
  });

  it("moves selection and DOM focus with arrow keys", async () => {
    const user = userEvent.setup();
    renderVisibilitySettings();

    statsRadio("Public").focus();
    await user.keyboard("{ArrowRight}");

    const friends = statsRadio("Friends Only");
    expect(friends.getAttribute("aria-checked")).toBe("true");
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("friends");
    // Focus has to ride along, otherwise it is stranded on the now
    // tabIndex={-1} previous option and the next Tab escapes unpredictably.
    expect(document.activeElement).toBe(friends);
    expect(friends.getAttribute("tabindex")).toBe("0");
    expect(statsRadio("Public").getAttribute("tabindex")).toBe("-1");
  });

  it("leaves focus alone when an arrow key press is gated behind auth", async () => {
    requireAuthMock.mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderVisibilitySettings();

    const publicRadio = statsRadio("Public");
    publicRadio.focus();
    await user.keyboard("{ArrowRight}");

    expect(useProfileStore.getState().visibilitySettings.stats).toBe("public");
    expect(document.activeElement).toBe(publicRadio);
  });

  it("moves selection and focus with arrow keys on mobile", async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    renderVisibilitySettings();

    statsRadio("Public").focus();
    await user.keyboard("{ArrowLeft}");

    const priv = statsRadio("Private");
    expect(priv.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(priv);
  });

  it("uses the same radiogroup semantics on mobile", () => {
    isMobileMock.mockReturnValue(true);
    renderVisibilitySettings();

    const group = screen.getByRole("radiogroup", { name: "Stats visibility" });
    expect(
      within(group).getByRole("radio", {
        name: "Stats: Public",
        checked: true,
      }),
    ).toBeTruthy();
  });

  it("gates changes behind auth when requireAuth does not run the callback", async () => {
    requireAuthMock.mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderVisibilitySettings();

    await user.click(statsRadio("Private"));

    expect(requireAuthMock).toHaveBeenCalled();
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("public");
    expect(statsRadio("Public").getAttribute("aria-checked")).toBe("true");
  });
});
