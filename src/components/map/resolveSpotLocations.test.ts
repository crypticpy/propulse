import { describe, expect, it } from "vitest";
import { resolveSpotLocations } from "./LiveSpotArcs";
import { getSpotColor, getSnrColor } from "@/lib/utils/spotColors";
import type { LiveSpot } from "@/types/livespot";

/**
 * Every map view colors from a ResolvedSpot, never from the raw LiveSpot, so
 * any field this function forgets to copy is invisible to the renderers no
 * matter how correct the color logic is. That is exactly how "By SNR" shipped
 * inert once already.
 */
function liveSpot(over: Partial<LiveSpot> = {}): LiveSpot {
  return {
    id: "test-1",
    spotter: "K1ABC",
    spotterGrid: "FN42",
    dx: "JA1XYZ",
    dxGrid: "PM95",
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date(),
    band: "20m",
    source: "PSKReporter",
    ...over,
  };
}

describe("resolveSpotLocations", () => {
  it("carries snr through so SNR coloring has something to read", () => {
    const [resolved] = resolveSpotLocations([liveSpot({ snr: -7 })]);
    expect(resolved).toBeDefined();
    expect(resolved.snr).toBe(-7);
    expect(getSpotColor(resolved, "snr")).toBe(getSnrColor(-7));
  });

  it("keeps a resolved spot's time usable for age coloring", () => {
    const time = new Date("2026-01-01T12:00:00Z");
    const [resolved] = resolveSpotLocations([liveSpot({ time })]);
    expect(resolved.time.getTime()).toBe(time.getTime());
  });

  it("retains the exact painted report for hover and click ownership", () => {
    const report = liveSpot({
      id: "snapshot-1",
      comment: "CQ POTA US-1234",
      receiverCallsign: "K2RX",
    });
    const [resolved] = resolveSpotLocations([report]);

    expect(resolved.originalSpot).toBe(report);
    expect(resolved.originalSpot.comment).toBe("CQ POTA US-1234");
    expect(resolved.originalSpot.receiverCallsign).toBe("K2RX");
  });

  it("leaves snr undefined when the source reports none", () => {
    const [resolved] = resolveSpotLocations([liveSpot()]);
    expect(resolved.snr).toBeUndefined();
  });
});
