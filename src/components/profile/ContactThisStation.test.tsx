import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VISIBILITY, type PublicProfile } from "@/types/social";
import { ContactThisStation } from "./ContactThisStation";

const analysisFixture = {
  distance: 111,
  bearing: 90,
  bandConditions: [],
  sharedBands: ["20m"],
  sharedModes: ["cw"],
  overlapHours: Array.from({ length: 24 }, () => false),
  bestBand: "20m",
  bestTimeRange: "14-18z",
};

const { useContactAnalysisMock } = vi.hoisted(() => ({
  useContactAnalysisMock: vi.fn((_args: unknown) => analysisFixture),
}));

vi.mock("@/hooks/useContactAnalysis", () => ({
  useContactAnalysis: (args: unknown) => useContactAnalysisMock(args),
}));

vi.mock("@/hooks/useChainPerformance", () => ({
  useChainPerformance: () => ({ bands: [] }),
}));

vi.mock("@/hooks/useActiveStationGain", () => ({
  useActiveStationGain: () => ({
    antennaType: "dipole",
    systemLossDb: 0,
    txPowerWatts: 100,
    physicsMode: "SSB" as const,
  }),
}));

const baseProfile: PublicProfile = {
  id: "profile-1",
  callsign: "TEST1",
  lat: 10,
  lon: 20,
};

const viewer = { viewerLat: 5, viewerLon: 15 };

function draw(
  profile: PublicProfile,
  coords: {
    viewerLat?: number;
    viewerLon?: number;
    viewerGrid?: string;
  } = viewer,
) {
  return render(<ContactThisStation profile={profile} {...coords} />);
}

describe("ContactThisStation coordinate presence (#369)", () => {
  afterEach(() => {
    cleanup();
    useContactAnalysisMock.mockClear();
  });

  it.each([
    [
      "target latitude 0",
      { lat: 0, lon: 20 },
      viewer,
      { targetLat: 0, targetLon: 20, viewerLat: 5, viewerLon: 15 },
    ],
    [
      "target longitude 0",
      { lat: 10, lon: 0 },
      viewer,
      { targetLat: 10, targetLon: 0, viewerLat: 5, viewerLon: 15 },
    ],
    [
      "viewer latitude 0",
      { lat: 10, lon: 20 },
      { viewerLat: 0, viewerLon: 15 },
      { targetLat: 10, targetLon: 20, viewerLat: 0, viewerLon: 15 },
    ],
    [
      "viewer longitude 0",
      { lat: 10, lon: 20 },
      { viewerLat: 5, viewerLon: 0 },
      { targetLat: 10, targetLon: 20, viewerLat: 5, viewerLon: 0 },
    ],
    [
      "equator and prime meridian backed by grids",
      { lat: 0, lon: 0, grid: "JJ00aa" },
      { viewerLat: 0, viewerLon: 0, viewerGrid: "JJ00aa" },
      { targetLat: 0, targetLon: 0, viewerLat: 0, viewerLon: 0 },
    ],
  ] as const)(
    "renders for %s",
    (_label, profileCoords, viewerCoords, expectedCoords) => {
      draw({ ...baseProfile, ...profileCoords }, viewerCoords);
      expect(screen.getByText("Contact TEST1")).toBeTruthy();
      expect(useContactAnalysisMock).toHaveBeenCalledWith(
        expect.objectContaining(expectedCoords),
      );
    },
  );

  it.each([
    ["missing target latitude", { lat: undefined, lon: 20 }],
    ["missing target longitude", { lat: 10, lon: undefined }],
    ["NaN latitude", { lat: Number.NaN, lon: 20 }],
    ["out-of-range latitude", { lat: 91, lon: 20 }],
    ["out-of-range longitude", { lat: 10, lon: 181 }],
  ] as const)("returns null for %s", (_label, profileCoords) => {
    const { container } = draw({ ...baseProfile, ...profileCoords });
    expect(container.firstChild).toBeNull();
    expect(useContactAnalysisMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLat: 0,
        targetLon: 0,
        viewerLat: 0,
        viewerLon: 0,
      }),
    );
  });

  it("returns null when viewer coordinates are absent", () => {
    const { container } = render(<ContactThisStation profile={baseProfile} />);
    expect(container.firstChild).toBeNull();
  });

  // ProfilePage stores a callsign-only station as lat: 0, lon: 0, grid: "",
  // and profileSync publishes that pair. Treating it as Gulf of Guinea would
  // invent a distance and a band recommendation for a station with no location.
  it("returns null for a callsign-only target saved with the (0, 0) sentinel", () => {
    const { container } = draw({
      ...baseProfile,
      lat: 0,
      lon: 0,
      grid: "",
    });
    expect(container.firstChild).toBeNull();
  });

  it("returns null when the viewer is callsign-only with the (0, 0) sentinel", () => {
    const { container } = draw(baseProfile, {
      viewerLat: 0,
      viewerLon: 0,
      viewerGrid: "",
    });
    expect(container.firstChild).toBeNull();
  });

  // #995 round 3: the target's coordinates are a published section. The panel
  // is rendered unconditionally by ProfilePage, so an unauthorized viewer must
  // get nothing here, whether or not the coordinates happen to be zero.
  it.each([
    ["zero coordinates", { lat: 0, lon: 0, grid: "JJ00aa" }],
    ["ordinary coordinates", { lat: 10, lon: 20, grid: "JJ11bb" }],
  ] as const)(
    "discloses nothing for a private location with %s",
    (_label, coords) => {
      const { container } = draw({
        ...baseProfile,
        ...coords,
        visibilitySettings: { ...DEFAULT_VISIBILITY, location: "private" },
      });
      expect(container.firstChild).toBeNull();
      expect(useContactAnalysisMock).toHaveBeenCalledWith(
        expect.objectContaining({
          targetLat: 0,
          targetLon: 0,
          viewerLat: 0,
          viewerLon: 0,
        }),
      );
    },
  );

  it("discloses nothing for a friends-only location when the viewer does not follow", () => {
    const { container } = draw({
      ...baseProfile,
      visibilitySettings: { ...DEFAULT_VISIBILITY, location: "friends" },
    });
    expect(container.firstChild).toBeNull();
  });

  it("renders a friends-only location for a following viewer", () => {
    render(
      <ContactThisStation
        profile={{
          ...baseProfile,
          visibilitySettings: { ...DEFAULT_VISIBILITY, location: "friends" },
        }}
        {...viewer}
        viewerIsFriend
      />,
    );
    expect(screen.getByText("Contact TEST1")).toBeTruthy();
  });

  it("renders a public location for any viewer", () => {
    draw({
      ...baseProfile,
      visibilitySettings: { ...DEFAULT_VISIBILITY, location: "public" },
    });
    expect(screen.getByText("Contact TEST1")).toBeTruthy();
  });

  it("still renders when only one coordinate of a gridless station is zero", () => {
    draw(
      { ...baseProfile, lat: 0, lon: 20, grid: undefined },
      {
        viewerLat: 5,
        viewerLon: 0,
        viewerGrid: undefined,
      },
    );
    expect(screen.getByText("Contact TEST1")).toBeTruthy();
  });
});
