import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { GlobeUnavailable } from "./GlobeUnavailable";

describe("GlobeUnavailable", () => {
  beforeEach(() => {
    useMapStore.setState({ viewMode: "globe" });
  });

  it("renders a heading and explanation", () => {
    render(<GlobeUnavailable onRetry={() => {}} />);

    expect(screen.getByText("3D globe unavailable")).toBeTruthy();
    expect(
      document.querySelector("[data-globe-unavailable]"),
    ).toBeTruthy();
  });

  it("switches to the flat map view", async () => {
    const user = userEvent.setup();
    render(<GlobeUnavailable onRetry={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Use flat map" }));

    expect(useMapStore.getState().viewMode).toBe("flat");
  });

  it("calls onRetry when Try again is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<GlobeUnavailable onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
