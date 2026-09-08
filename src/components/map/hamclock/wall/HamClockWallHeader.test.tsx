import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HamClockWallHeader } from "./HamClockWallHeader";

it("keeps density and settings in the masthead while mode and projection move into settings", () => {
  render(<HamClockWallHeader onOpenSettings={vi.fn()} />);
  expect(screen.getByRole("button", { name: "DESK" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "SETTINGS" })).toBeTruthy();
  expect(screen.queryByRole("group", { name: "HamClock mode" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Map projection" })).toBeNull();
});
