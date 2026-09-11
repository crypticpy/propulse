import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicProfile } from "@/types/social";
import { VisitorProfileCard } from "./VisitorProfileCard";

vi.mock("@/hooks/useVisualEffects", () => ({ useVisualEffects: () => ({}) }));
vi.mock("@/hooks/useRankAssets", () => ({ useRankAssets: () => ({}) }));

const profile: PublicProfile = {
  id: "operator-1",
  callsign: "N0TEST",
  grid: "DM79",
  lat: 39.74,
  lon: -104.98,
  visibilitySettings: {
    stats: "public",
    awards: "public",
    equipment: "public",
    activity: "public",
    location: "friends",
  },
};

function draw(locationDisclosed: boolean) {
  return render(
    <VisitorProfileCard
      profile={profile}
      locationDisclosed={locationDisclosed}
      isFollowing={false}
      onFollow={() => {}}
      onUnfollow={() => {}}
    />,
  );
}

describe("VisitorProfileCard location disclosure (#995)", () => {
  afterEach(cleanup);

  // The card used to render the grid unconditionally and to treat every
  // non-private location as public, so a friends-only station disclosed its
  // grid and its coordinates to any visitor on the desktop layout.
  it("shows no grid and no coordinates when the location is not disclosed", () => {
    draw(false);
    expect(screen.queryByText("DM79")).toBeNull();
    expect(screen.queryByText("Coordinates")).toBeNull();
    expect(screen.queryByText(/39\.74/)).toBeNull();
  });

  it("shows the grid and the coordinates once the page authorizes the viewer", () => {
    draw(true);
    expect(screen.getAllByText("DM79").length).toBeGreaterThan(0);
    expect(screen.getByText("Coordinates")).toBeTruthy();
    expect(screen.getByText("39.74, -104.98")).toBeTruthy();
  });
});
