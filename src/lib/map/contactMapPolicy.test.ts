import { describe, expect, it } from "vitest";
import {
  computeContactFrame,
  contactFrameDistance,
  contactSpotOpacity,
  isSameStationCall,
  resolveMapPolicyScope,
} from "./contactMapPolicy";

describe("contact map policy", () => {
  it("keeps contest data policy and restores public discovery in Contact/Desk", () => {
    expect(resolveMapPolicyScope("contest", "contact")).toBe("contest");
    expect(resolveMapPolicyScope("log", "contact")).toBe("observe");
    expect(resolveMapPolicyScope("log", "desk")).toBe("observe");
    expect(resolveMapPolicyScope("log", "observe")).toBe("log");
    expect(resolveMapPolicyScope("observe", "observe")).toBe("observe");
  });

  it("dims other spots in Contact and keeps same-band neighbors brighter", () => {
    expect(
      contactSpotOpacity({
        posture: "observe",
        isContactTarget: false,
        matchesContactBand: false,
      }),
    ).toBe(1);
    expect(
      contactSpotOpacity({
        posture: "contact",
        isContactTarget: true,
        matchesContactBand: false,
      }),
    ).toBe(1);
    expect(
      contactSpotOpacity({
        posture: "contact",
        isContactTarget: false,
        matchesContactBand: true,
      }),
    ).toBe(0.7);
    expect(
      contactSpotOpacity({
        posture: "contact",
        isContactTarget: false,
        matchesContactBand: false,
      }),
    ).toBe(0.35);
  });

  it("frames the short-path midpoint and pulls back for longer paths", () => {
    expect(contactFrameDistance(0)).toBeCloseTo(1.85);
    expect(contactFrameDistance(180)).toBeCloseTo(3.2);

    const frame = computeContactFrame(
      { lat: 41.7, lon: -72.7 },
      { lat: -23.5, lon: -46.6 },
    );
    expect(frame.lat).toBeGreaterThan(-23.5);
    expect(frame.lat).toBeLessThan(41.7);
    expect(frame.distance).toBeGreaterThan(1.85);
    expect(frame.distance).toBeLessThan(3.2);
  });

  it("matches the worked station by exact callsign", () => {
    expect(isSameStationCall("py2abc", "PY2ABC")).toBe(true);
    expect(isSameStationCall("PY2ABC/P", "PY2ABC")).toBe(false);
  });
});
