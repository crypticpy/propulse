import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKioskStore } from "@/stores/kioskStore";
import { KioskTab } from "./KioskTab";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/map"]}>
      <KioskTab />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("KioskTab", () => {
  beforeEach(() => {
    useKioskStore.setState({ active: false, activeSceneId: null });
  });

  it("says no scene is pinning the wall when kiosk mode is inactive", () => {
    renderTab();
    expect(
      screen.getByText("No kiosk scene is pinning the wall."),
    ).toBeTruthy();
  });

  it("says no scene is pinning the wall when the active scene is not the hamclock layout", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [{ id: "s1", name: "Globe", route: "/map", map: { layoutMode: "normal" } }],
    });
    renderTab();
    expect(
      screen.getByText("No kiosk scene is pinning the wall."),
    ).toBeTruthy();
  });

  it("says no scene is pinning the wall when kiosk playback is stopped, even with a resumable activeSceneId", () => {
    // stop() intentionally keeps activeSceneId around so playback can resume
    // — that must not read as "pinning the wall" while stopped.
    useKioskStore.setState({
      active: false,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Wall demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "spots" },
          },
        },
      ],
    });
    renderTab();
    expect(
      screen.getByText("No kiosk scene is pinning the wall."),
    ).toBeTruthy();
  });

  it("summarizes the pinned page when the active scene pins HamClock to one page", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Wall demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "spots" },
          },
        },
      ],
    });
    renderTab();
    expect(
      screen.getByText('"Wall demo" pins the wall to Spots & Activity.'),
    ).toBeTruthy();
  });

  it("summarizes both pages when the two rails are pinned differently", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Split demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "solar" },
          },
        },
      ],
    });
    renderTab();
    expect(
      screen.getByText(
        '"Split demo" pins the wall to Spots & Activity (left) / Solar & Space Wx (right).',
      ),
    ).toBeTruthy();
  });

  it("navigates to /kiosk from OPEN KIOSK EDITOR", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "OPEN KIOSK EDITOR" }));
    expect(screen.getByTestId("location").textContent).toBe("/kiosk");
  });

  it("stops kiosk playback before opening the editor, so its rotation timer can't navigate away mid-edit", () => {
    const stop = vi.fn(() => useKioskStore.setState({ active: false }));
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Wall demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "spots" },
          },
        },
      ],
      stop,
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "OPEN KIOSK EDITOR" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location").textContent).toBe("/kiosk");
  });

  it("does not call stop when kiosk playback was already inactive", () => {
    const stop = vi.fn();
    useKioskStore.setState({ active: false, activeSceneId: null, stop });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "OPEN KIOSK EDITOR" }));
    expect(stop).not.toHaveBeenCalled();
  });
});
