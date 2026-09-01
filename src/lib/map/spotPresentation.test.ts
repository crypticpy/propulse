import { describe, expect, it } from "vitest";
import {
  extractSpotReference,
  formatSpotCopyText,
  formatSpotPresentationLabel,
  mapSpotModeToRigMode,
  normalizePresentableSpot,
} from "./spotPresentation";

const spot = {
  id: "spot-1",
  spotter: "W1AW",
  dx: "KA1VRY",
  dxGrid: "EM08PX",
  frequency: 24915,
  mode: "FT8",
  band: "12m",
  comment: "CQ POTA US-7948",
  time: new Date("2026-08-31T12:00:00Z"),
};

describe("spot presentation", () => {
  it("preserves the activation reference in the reference hover label", () => {
    expect(extractSpotReference(spot.comment)).toBe("POTA US-7948");
    expect(formatSpotPresentationLabel(spot.dx, spot.comment)).toBe(
      "KA1VRY · POTA US-7948",
    );
  });

  it("normalizes collector reports to a live spot without discarding data", () => {
    expect(normalizePresentableSpot(spot)).toMatchObject({
      dx: "KA1VRY",
      source: "Cluster",
      comment: "CQ POTA US-7948",
    });
  });

  it("builds a useful clipboard summary and maps digital tuning to USB", () => {
    expect(formatSpotCopyText(spot)).toContain("KA1VRY · 24.915 MHz");
    expect(mapSpotModeToRigMode("FT8", 24915)).toBe("USB");
    expect(mapSpotModeToRigMode("SSB", 7200)).toBe("LSB");
  });
});
