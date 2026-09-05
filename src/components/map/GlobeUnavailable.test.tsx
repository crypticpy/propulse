import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GlobeUnavailable } from "./GlobeUnavailable";

describe("GlobeUnavailable", () => {
  it("renders a heading and explanation", () => {
    render(<GlobeUnavailable onRetry={() => {}} onUseFlatMap={() => {}} />);

    expect(screen.getByText("3D globe unavailable")).toBeTruthy();
    expect(
      document.querySelector("[data-globe-unavailable]"),
    ).toBeTruthy();
  });

  it("calls onUseFlatMap when Use flat map is clicked", async () => {
    const user = userEvent.setup();
    const onUseFlatMap = vi.fn();
    render(<GlobeUnavailable onRetry={() => {}} onUseFlatMap={onUseFlatMap} />);

    await user.click(screen.getByRole("button", { name: "Use flat map" }));

    expect(onUseFlatMap).toHaveBeenCalledOnce();
  });

  it("calls onRetry when Try again is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<GlobeUnavailable onRetry={onRetry} onUseFlatMap={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
