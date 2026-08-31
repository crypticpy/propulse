import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WeatherAlert } from "@/lib/api/weather";
import { WeatherAlertModal } from "./WeatherAlertModal";

const weatherAlert: WeatherAlert = {
  id: "weather-focus-test",
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

function WeatherAlertHarness() {
  const [alert, setAlert] = useState<WeatherAlert | null>(null);
  return (
    <>
      <button type="button" onClick={() => setAlert(weatherAlert)}>
        Open weather alert
      </button>
      <WeatherAlertModal alert={alert} onClose={() => setAlert(null)} />
    </>
  );
}

describe("WeatherAlertModal", () => {
  it("moves focus into the dialog and restores the ticker trigger on close", async () => {
    render(<WeatherAlertHarness />);
    const opener = screen.getByRole("button", { name: "Open weather alert" });

    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", {
      name: "Severe Thunderstorm Warning",
    });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });

  it("only announces radio-impact guidance when that section is present", async () => {
    const floodAlert: WeatherAlert = {
      ...weatherAlert,
      id: "flood-description-test",
      event: "Flood Warning",
      severity: "Moderate",
    };

    render(<WeatherAlertModal alert={floodAlert} onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog", {
      name: "Flood Warning",
    });

    expect(dialog.textContent).toContain("Moderate weather alert.");
    expect(dialog.textContent).not.toContain("expected radio impact");
  });
});
