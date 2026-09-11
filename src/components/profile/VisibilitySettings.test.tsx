import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VISIBILITY } from "@/types/social";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
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

/** Native radios are named by their own label, not by the section. */
function statsRadio(level: string): HTMLInputElement {
  return within(sectionRow("Stats")).getByRole("radio", {
    name: level,
  }) as HTMLInputElement;
}

function mobileStatsRadio(level: string): HTMLInputElement {
  const group = screen.getByRole("radiogroup", { name: "Stats visibility" });
  return within(group).getByRole("radio", { name: level }) as HTMLInputElement;
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

  it("exposes every desktop choice as a native radio with one checked per section", () => {
    renderVisibilitySettings();

    for (const section of [
      "Stats",
      "Awards",
      "Equipment",
      "Activity",
      "Location",
    ]) {
      const radios = within(sectionRow(section)).getAllByRole(
        "radio",
      ) as HTMLInputElement[];
      expect(radios).toHaveLength(3);
      for (const radio of radios) {
        expect(radio.tagName).toBe("INPUT");
        expect(radio.type).toBe("radio");
        // The native checked state is the one assistive tech reads; a
        // hand-written aria-checked on a native radio can only contradict it.
        expect(radio.getAttribute("aria-checked")).toBeNull();
      }
      expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
      for (const level of ["Public", "Friends Only", "Private"]) {
        expect(
          within(sectionRow(section)).getByRole("radio", { name: level }),
        ).toBeTruthy();
      }
    }

    expect(statsRadio("Public").checked).toBe(true);
    expect(statsRadio("Friends Only").checked).toBe(false);
  });

  it("groups each desktop row by a shared radio name, unique per section", () => {
    renderVisibilitySettings();

    const names = new Set<string>();
    for (const section of [
      "Stats",
      "Awards",
      "Equipment",
      "Activity",
      "Location",
    ]) {
      const radios = within(sectionRow(section)).getAllByRole(
        "radio",
      ) as HTMLInputElement[];
      const rowNames = new Set(radios.map((radio) => radio.name));
      // One name across the three cells is what makes them a group without an
      // element containing them.
      expect(rowNames.size).toBe(1);
      const [name] = [...rowNames];
      expect(name).toBeTruthy();
      names.add(name);
    }
    // Five rows, five groups: a shared name across rows would make the whole
    // matrix one radio group and allow only one checked choice in total.
    expect(names.size).toBe(5);
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

  it("keeps the label as the hit target so the control is not a bare native dot", () => {
    renderVisibilitySettings();

    const label = statsRadio("Public").closest("label");
    expect(label).toBeTruthy();
    expect(label?.className).toContain("w-6");
    expect(label?.className).toContain("h-6");
    // The input itself is visually replaced by the drawn dot.
    expect(statsRadio("Public").className).toContain("sr-only");
  });

  it("updates the checked radio after selection and rerender", async () => {
    const user = userEvent.setup();
    renderVisibilitySettings();

    await user.click(statsRadio("Friends Only"));

    expect(statsRadio("Friends Only").checked).toBe(true);
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("friends");
  });

  it("moves selection and DOM focus with arrow keys", async () => {
    const user = userEvent.setup();
    renderVisibilitySettings();

    statsRadio("Public").focus();
    await user.keyboard("{ArrowRight}");

    const friends = statsRadio("Friends Only");
    expect(friends.checked).toBe(true);
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("friends");
    expect(document.activeElement).toBe(friends);
  });

  it("keeps the gated choice unchecked when an arrow key press is blocked by auth", async () => {
    requireAuthMock.mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderVisibilitySettings();

    statsRadio("Public").focus();
    await user.keyboard("{ArrowRight}");

    expect(useProfileStore.getState().visibilitySettings.stats).toBe("public");
    // The controlled value wins: nothing is committed, so Public stays checked.
    expect(statsRadio("Public").checked).toBe(true);
    expect(statsRadio("Friends Only").checked).toBe(false);
  });

  it("moves selection and focus with arrow keys on mobile", async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    renderVisibilitySettings();

    mobileStatsRadio("Public").focus();
    await user.keyboard("{ArrowLeft}");

    const priv = mobileStatsRadio("Private");
    expect(priv.checked).toBe(true);
    expect(document.activeElement).toBe(priv);
  });

  it("uses the same radiogroup semantics on mobile", () => {
    isMobileMock.mockReturnValue(true);
    renderVisibilitySettings();

    const group = screen.getByRole("radiogroup", { name: "Stats visibility" });
    expect(
      within(group).getByRole("radio", { name: "Public", checked: true }),
    ).toBeTruthy();
  });

  it("gates changes behind auth when requireAuth does not run the callback", async () => {
    requireAuthMock.mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderVisibilitySettings();

    await user.click(statsRadio("Private"));

    expect(requireAuthMock).toHaveBeenCalled();
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("public");
    expect(statsRadio("Public").checked).toBe(true);
  });

  it("defers focus until the sign-in dialog has torn down", async () => {
    let deferred: (() => void) | null = null;
    requireAuthMock.mockImplementation((callback: () => void) => {
      deferred = callback;
    });

    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <VisibilitySettings />
          <AccessibleDialog open={open} onClose={() => {}} title="Sign in">
            <button type="button">Continue</button>
          </AccessibleDialog>
        </>
      );
    }

    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);

    // Held across the open dialog: the background goes inert while a modal is
    // up, so it is unqueryable from `screen` until the dialog tears down.
    const privateRadio = statsRadio("Private");
    await user.click(privateRadio);
    expect(useProfileStore.getState().visibilitySettings.stats).toBe("public");

    // The sign-in modal is what requireAuth put up; it owns focus now.
    rerender(<Harness open />);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    await act(async () => {
      deferred?.();
    });

    expect(useProfileStore.getState().visibilitySettings.stats).toBe("private");
    // Focusing the radio here would yank focus out of the open modal, and the
    // modal's own restore would then undo it on close.
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(privateRadio);

    rerender(<Harness open={false} />);

    expect(document.activeElement).toBe(privateRadio);
    expect(privateRadio.checked).toBe(true);
  });
});
