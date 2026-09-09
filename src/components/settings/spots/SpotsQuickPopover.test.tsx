import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotsPreferencesProvider } from "./SpotsPreferencesProvider";
import { SpotsQuickPopover } from "./SpotsQuickPopover";
import { createMemoryLibraryPort, createTestView, type TestViewHandle } from "./testing";

function Harness({ handle }: { handle: TestViewHandle }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const library = createMemoryLibraryPort();
  return (
    <SpotsPreferencesProvider view={handle.view} library={library}>
      <button ref={triggerRef} type="button">
        Spots preferences trigger
      </button>
      <SpotsQuickPopover
        open
        onClose={() => {}}
        triggerRef={triggerRef}
        onOpenAllPreferences={() => {}}
      />
    </SpotsPreferencesProvider>
  );
}

describe("SpotsQuickPopover grouping toggle (#746)", () => {
  // jsdom has no ResizeObserver; the popover uses one to reposition against
  // its trigger (same stub as SpotsPreferencesPanel.test.tsx).
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  // Flat renders groups since #746; the option-B gate is gone.
  it("keeps the grouping checkbox enabled on the flat projection (#746)", () => {
    const handle = createTestView({ family: "hamclock" });
    render(<Harness handle={handle} />);

    expect(
      (screen.getByRole("checkbox", { name: "Group nearby spots" }) as HTMLInputElement).disabled,
    ).toBe(false);
    expect(
      screen.queryByText(/Grouping applies to the globe and azimuthal projections/),
    ).toBeNull();
    handle.dispose();
  });

  it("keeps the grouping checkbox enabled on the globe projection", () => {
    const handle = createTestView({ family: "pro" });
    render(<Harness handle={handle} />);

    expect(
      (screen.getByRole("checkbox", { name: "Group nearby spots" }) as HTMLInputElement).disabled,
    ).toBe(false);
    expect(
      screen.queryByText(/Grouping applies to the globe and azimuthal projections/),
    ).toBeNull();
    handle.dispose();
  });
});
