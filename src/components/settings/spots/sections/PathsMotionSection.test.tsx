import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useSpotsPreferences } from "../useSpotsPreferences";
import { createTestView, type TestViewHandle } from "../testing";
import type { SpotsPreferencesController } from "../types";
import { PathsMotionSection } from "./PathsMotionSection";

function Harness({
  handle,
  onController,
}: {
  handle: TestViewHandle;
  onController?: (controller: SpotsPreferencesController) => void;
}) {
  const controller = useSpotsPreferences({ view: handle.view });
  onController?.(controller);
  return <PathsMotionSection controller={controller} />;
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

describe("PathsMotionSection", () => {
  it("offers and selects all four background styles", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });

    const group = screen.getByRole("group", { name: "Background path timing" });
    const styles: [string, string][] = [
      ["Off", "off"],
      ["Quick sweep", "quick-sweep"],
      ["Traveling pulse", "traveling-pulse"],
      ["Flowing dashes", "flowing-dashes"],
    ];
    for (const [label, value] of styles) {
      const radio = within(group).getByRole("radio", { name: label });
      await user.click(radio);
      expect(latest?.spots.paths.background.style).toBe(value);
    }
  });

  it("changes shape and style independently", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const group = screen.getByRole("group", { name: "Background path timing" });

    const initialStyle = latest?.spots.paths.background.style;
    await user.click(within(group).getByRole("radio", { name: "Ionospheric hops" }));
    expect(latest?.spots.paths.background.shape).toBe("ionospheric-hops");
    expect(latest?.spots.paths.background.style).toBe(initialStyle);

    const initialShape = latest?.spots.paths.background.shape;
    await user.click(within(group).getByRole("radio", { name: "Flowing dashes" }));
    expect(latest?.spots.paths.background.style).toBe("flowing-dashes");
    expect(latest?.spots.paths.background.shape).toBe(initialShape);
  });

  it("'Same as background paths' controls whether paths.selected is null", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });

    // The default seed gives the selected path its own distinct appearance.
    expect(latest?.spots.paths.selected).not.toBeNull();

    const sameAsBackground = screen.getByRole("switch", { name: "Same as background paths" });
    await user.click(sameAsBackground);
    expect(latest?.spots.paths.selected).toBeNull();

    await user.click(sameAsBackground);
    expect(latest?.spots.paths.selected).not.toBeNull();
    expect(latest?.spots.paths.selected).toEqual(latest?.spots.paths.background);
  });

  it("writes each background timing slider within its documented range and shows units", () => {
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const group = screen.getByRole("group", { name: "Background path timing" });

    const travel = within(group).getByRole("slider", { name: "Travel duration" });
    expect(travel.getAttribute("aria-valuetext")).toContain("s");
    fireSlider(travel, 3);
    expect(latest?.spots.paths.background.travelSeconds).toBeGreaterThanOrEqual(0.25);
    expect(latest?.spots.paths.background.travelSeconds).toBeLessThanOrEqual(5);

    const trail = within(group).getByRole("slider", { name: "Trail persistence" });
    fireSlider(trail, 20);
    expect(latest?.spots.paths.background.trailSeconds).toBeGreaterThanOrEqual(0);
    expect(latest?.spots.paths.background.trailSeconds).toBeLessThanOrEqual(30);

    const fade = within(group).getByRole("slider", { name: "Fade time" });
    fireSlider(fade, 2);
    expect(latest?.spots.paths.background.fadeSeconds).toBeGreaterThanOrEqual(0);
    expect(latest?.spots.paths.background.fadeSeconds).toBeLessThanOrEqual(5);

    const repeat = within(group).getByRole("slider", { name: "Repeat interval" });
    fireSlider(repeat, 8);
    expect(latest?.spots.paths.background.repeatSeconds).toBeGreaterThanOrEqual(1);
    expect(latest?.spots.paths.background.repeatSeconds).toBeLessThanOrEqual(10);
  });

  it("toggles reduce motion", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    expect(latest?.spots.paths.reduceMotion).toBe(false);
    await user.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(latest?.spots.paths.reduceMotion).toBe(true);
  });

  it("writes max active and max pending within range", () => {
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const maxActive = screen.getByRole("slider", { name: "Maximum simultaneous animations" });
    fireSlider(maxActive, 6);
    expect(latest?.spots.paths.maxActive).toBeGreaterThanOrEqual(1);
    expect(latest?.spots.paths.maxActive).toBeLessThanOrEqual(12);

    const maxPending = screen.getByRole("slider", { name: "Pending animation queue" });
    fireSlider(maxPending, 30);
    expect(latest?.spots.paths.maxPending).toBeGreaterThanOrEqual(0);
    expect(latest?.spots.paths.maxPending).toBeLessThanOrEqual(100);
  });

  it("does not touch filters or grouping when motion changes", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const beforeFilters = latest?.spots.filters;
    const beforeGrouping = latest?.spots.grouping;

    await user.click(screen.getByRole("switch", { name: "Reduce motion" }));
    await user.click(screen.getByRole("radio", { name: "All displayed paths" }));

    expect(latest?.spots.filters).toEqual(beforeFilters);
    expect(latest?.spots.grouping).toEqual(beforeGrouping);
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

    const toggles = screen.getAllByRole("switch", { name: "Reduce motion" });
    await user.click(toggles[0]);

    expect(controllerA?.spots.paths.reduceMotion).toBe(true);
    expect(controllerB?.spots.paths.reduceMotion).toBe(false);
  });

  it("supports keyboard operation of the background style control", async () => {
    const user = userEvent.setup();
    let latest: SpotsPreferencesController | undefined;
    mount((controller) => {
      latest = controller;
    });
    const group = screen.getByRole("group", { name: "Background path timing" });
    const offRadio = within(group).getByRole("radio", { name: "Off" });

    offRadio.focus();
    await user.keyboard("{Enter}");

    expect(latest?.spots.paths.background.style).toBe("off");
  });
});
