import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapToolbarSecondaryControls } from "./MapToolbarSecondaryControls";

vi.mock("./ColorsPopover", () => ({
  ColorsPopover: () => <button type="button">Colors</button>,
}));

vi.mock("./ProfilePopover", () => ({
  ProfilePopover: ({
    onSelectProfile,
  }: {
    onSelectProfile: (profileId: null) => void;
  }) => (
    <button type="button" onClick={() => onSelectProfile(null)}>
      Profile
    </button>
  ),
}));

vi.mock("./WatchPopover", () => ({
  WatchPopover: () => <button type="button">Watch</button>,
}));

vi.mock("./WatchStatusPill", () => ({
  WatchStatusPill: () => <span role="status">Watch status</span>,
}));

vi.mock("./ClusterPopover", () => ({
  ClusterPopover: () => <button type="button">Cluster</button>,
}));

function renderControls(inMenu: boolean) {
  const callbacks = {
    closeMenu: vi.fn(),
    onCyclePanelLayout: vi.fn(),
    onEnterObservatory: vi.fn(),
    onSelectProfile: vi.fn(),
    onToggleActivity: vi.fn(),
  };

  render(
    <MapToolbarSecondaryControls
      activeProfile={null}
      activityPanelOpen={false}
      inMenu={inMenu}
      panelLayoutActive={false}
      panelLayoutTitle="Compact panels"
      showPanelControl
      {...callbacks}
    />,
  );

  return callbacks;
}

describe("MapToolbarSecondaryControls", () => {
  it("exposes every secondary action in the constrained-width menu", () => {
    const callbacks = renderControls(true);

    for (const name of [
      "Colors",
      "Profile",
      "Observatory",
      "Panels",
      "Watch",
      "Cluster",
      "Activity",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("status", { name: "Watch status" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Observatory" }));
    fireEvent.click(screen.getByRole("button", { name: "Panels" }));
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));

    expect(callbacks.onSelectProfile).toHaveBeenCalledWith(null);
    expect(callbacks.onEnterObservatory).toHaveBeenCalledOnce();
    expect(callbacks.onCyclePanelLayout).toHaveBeenCalledOnce();
    expect(callbacks.onToggleActivity).toHaveBeenCalledOnce();
    expect(callbacks.closeMenu).toHaveBeenCalledTimes(4);
  });

  it("preserves the inline watch status in the wide layout", () => {
    renderControls(false);

    expect(screen.getByRole("status").textContent).toBe("Watch status");
  });
});
