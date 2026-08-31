import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WeatherAlert } from "@/lib/api/weather";
import { GlobeWeatherAlertFlow } from "./GlobeWeatherAlertFlow";

const weatherAlert: WeatherAlert = {
  id: "globe-weather-focus-test",
  event: "Severe Thunderstorm Warning",
  headline: "Severe thunderstorms remain possible across the test area.",
  severity: "Severe",
  lat: 41,
  lon: -88,
  areaDesc: "Test County",
  urgency: "Immediate",
  certainty: "Observed",
  response: "Shelter",
  instruction: "Move indoors.",
  polygon: null,
};

describe("GlobeWeatherAlertFlow", () => {
  it("keeps the flyout opener mounted and restores focus after full details", async () => {
    const onFlyoutClose = vi.fn();
    render(
      <GlobeWeatherAlertFlow
        selection={{ alert: weatherAlert, screenPos: { x: 300, y: 300 } }}
        onFlyoutClose={onFlyoutClose}
      />,
    );

    const flyout = screen.getByRole("dialog", {
      name: "Weather alert: Severe Thunderstorm Warning",
    });
    const opener = within(flyout).getByRole("button", {
      name: "View Full Alert",
    });

    // Let the flyout's deferred outside-click listener install before opening
    // the child modal; the flow must actively suspend it, not rely on timing.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    opener.focus();
    fireEvent.click(opener);

    const detailDialog = await screen.findByRole("dialog", {
      name: "Severe Thunderstorm Warning",
    });
    await waitFor(() => {
      expect(detailDialog.contains(document.activeElement)).toBe(true);
    });

    const closeButton = within(detailDialog).getByRole("button", {
      name: "Close dialog",
    });
    fireEvent.mouseDown(closeButton);
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Severe Thunderstorm Warning",
        }),
      ).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
    expect(onFlyoutClose).not.toHaveBeenCalled();
    expect(document.body.contains(flyout)).toBe(true);
  });
});
