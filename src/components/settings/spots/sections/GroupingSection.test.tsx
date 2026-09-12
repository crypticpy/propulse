import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useSpotsPreferences } from "../useSpotsPreferences";
import { createTestView, type TestViewHandle } from "../testing";
import type { SpotsPreferencesController } from "../types";
import { GroupingSection } from "./GroupingSection";

function Harness({
  handle,
  onController,
}: {
  handle: TestViewHandle;
  onController?: (controller: SpotsPreferencesController) => void;
}) {
  const controller = useSpotsPreferences({ view: handle.view });
  onController?.(controller);
  return <GroupingSection controller={controller} />;
}

function mount(onController?: (controller: SpotsPreferencesController) => void) {
  const handle = createTestView();
  render(<Harness handle={handle} onController={onController} />);
  return handle;
}

function fireSlider(element: HTMLElement, value: number) {
  const input = element as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("GroupingSection", () => {
  it("defaults to Regions with a minimum group size of 3", () => {
    mount();
    expect(screen.getByRole("radio", { name: "Regions" }).getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByRole("slider", { name: "Minimum group size" }).getAttribute("aria-valuenow"),
    ).toBe("3");
  });

  it("reveals the six-character grid choice only under Maidenhead grids", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });

    await user.click(screen.getByRole("radio", { name: "Maidenhead grids" }));
    expect(latest?.spots.grouping.detail).toBe("grid4");

    const grid6 = screen.getByRole("switch", { name: "Use precise six-character grid squares" });
    await user.click(grid6);
    expect(latest?.spots.grouping.detail).toBe("grid6");

    await user.click(screen.getByRole("radio", { name: "Regions" }));
    expect(latest?.spots.grouping.detail).toBe("regions");

    await user.click(screen.getByRole("radio", { name: "Maidenhead grids" }));
    expect(latest?.spots.grouping.detail).toBe("grid4");
  });

  it("writes the minimum group size slider within 2-50", async () => {
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const slider = screen.getByRole("slider", { name: "Minimum group size" });

    fireSlider(slider, 45);
    await waitFor(() => {
      expect(latest?.spots.grouping.minGroupSize).toBe(45);
    });

    fireSlider(slider, 0);
    await waitFor(() => {
      expect(latest?.spots.grouping.minGroupSize).toBeGreaterThanOrEqual(2);
    });

    fireSlider(slider, 999);
    await waitFor(() => {
      expect(latest?.spots.grouping.minGroupSize).toBeLessThanOrEqual(50);
    });
  });

  it("does not touch filters, path style or animate scope when grouping changes", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const beforeFilters = latest?.spots.filters;
    const beforeBackgroundStyle = latest?.spots.paths.background.style;
    const beforeAnimate = latest?.spots.paths.animate;

    await user.click(screen.getByRole("switch", { name: "Group nearby reports" }));
    await user.click(screen.getByRole("radio", { name: "Maidenhead grids" }));

    expect(latest?.spots.filters).toEqual(beforeFilters);
    expect(latest?.spots.paths.background.style).toBe(beforeBackgroundStyle);
    expect(latest?.spots.paths.animate).toBe(beforeAnimate);
  });

  it("keeps two instances isolated", async () => {
    const user = userEvent.setup();
    const handleA = createTestView();
    const handleB = createTestView();
    let controllerA: SpotsPreferencesController | undefined;
    let controllerB: SpotsPreferencesController | undefined;

    render(
      <>
        <Harness handle={handleA} onController={(c) => (controllerA = c)} />
        <Harness handle={handleB} onController={(c) => (controllerB = c)} />
      </>,
    );

    const toggles = screen.getAllByRole("switch", { name: "Group nearby reports" });
    await user.click(toggles[0]);

    expect(controllerA?.spots.grouping.enabled).toBe(false);
    expect(controllerB?.spots.grouping.enabled).toBe(true);
  });

  // The flat map renders cluster glyphs since #746, so the option-B gate that
  // #615 added here is gone. `family: "hamclock"` is the flat-projection view.
  it("keeps grouping controls enabled on the flat projection (#746)", () => {
    const handle = createTestView({ family: "hamclock" });
    render(<Harness handle={handle} />);

    expect(
      (screen.getByRole("switch", { name: "Group nearby reports" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((screen.getByRole("radio", { name: "Regions" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(
      (screen.getByRole("radio", { name: "Maidenhead grids" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("slider", { name: "Minimum group size" }) as HTMLInputElement).disabled,
    ).toBe(false);
    expect(
      screen.queryByText(/Grouping applies to the globe and azimuthal projections/),
    ).toBeNull();
  });

  it("keeps grouping controls enabled on the globe projection", () => {
    const handle = createTestView({ family: "pro" });
    render(<Harness handle={handle} />);

    expect(
      (screen.getByRole("switch", { name: "Group nearby reports" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("slider", { name: "Minimum group size" }) as HTMLInputElement).disabled,
    ).toBe(false);
    expect(
      screen.queryByText(/Grouping applies to the globe and azimuthal projections/),
    ).toBeNull();
  });

  it("supports keyboard operation of the grouping level control", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });

    await user.tab();
    while (document.activeElement?.getAttribute("role") !== "radio") {
      await user.tab();
    }
    // First radio reached is "Regions"; tab again to "Maidenhead grids" and activate it.
    await user.tab();
    await user.keyboard("{Enter}");

    expect(latest?.spots.grouping.detail).not.toBe("regions");
  });
});
