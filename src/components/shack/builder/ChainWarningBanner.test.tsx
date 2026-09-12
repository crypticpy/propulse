import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ChainWarningBanner } from "./ChainWarningBanner";

afterEach(cleanup);

it("retains severity icons and messages while routing each pill to a shared treatment", () => {
  render(
    <ChainWarningBanner
      warnings={[
        {
          code: "no_radio",
          severity: "warning",
          message: "Add a radio to transmit",
        },
        {
          code: "antenna_not_last",
          severity: "info",
          message: "Antenna is usually last",
        },
      ]}
    />,
  );
  const warning = screen.getByText("Add a radio to transmit").parentElement!;
  const info = screen.getByText("Antenna is usually last").parentElement!;
  expect(warning.classList.contains("su-tone-warning")).toBe(true);
  expect(info.classList.contains("su-tone-neutral")).toBe(true);
  for (const pill of [warning, info]) {
    expect(pill.classList.contains("su-treatment--subtle")).toBe(true);
    expect(pill.classList.contains("su-treatment--interactive")).toBe(false);
    expect(pill.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  }
  expect(warning.querySelector("path")?.getAttribute("d")).not.toBe(
    info.querySelector("path")?.getAttribute("d"),
  );
});

it("removes the banner when validation has no warnings", () => {
  const { container, rerender } = render(
    <ChainWarningBanner
      warnings={[
        { code: "no_radio", severity: "warning", message: "Add a radio" },
      ]}
    />,
  );
  expect(screen.getByText("Add a radio")).toBeTruthy();
  rerender(<ChainWarningBanner warnings={[]} />);
  expect(container.childElementCount).toBe(0);
});
