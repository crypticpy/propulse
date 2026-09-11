import { describe, expect, it } from "vitest";
import { DEFAULT_VISIBILITY } from "@/types/social";
import { isSectionVisibleToViewer } from "./visibility";

describe("isSectionVisibleToViewer", () => {
  it("keeps an unpublished settings object open, as ProfilePage always has", () => {
    expect(isSectionVisibleToViewer(undefined, "location", false)).toBe(true);
  });

  it("hides a private section from every viewer, friend or not", () => {
    const settings = { ...DEFAULT_VISIBILITY, location: "private" as const };
    expect(isSectionVisibleToViewer(settings, "location", false)).toBe(false);
    expect(isSectionVisibleToViewer(settings, "location", true)).toBe(false);
  });

  it("gives a friends-only section to a follower only", () => {
    const settings = { ...DEFAULT_VISIBILITY, location: "friends" as const };
    expect(isSectionVisibleToViewer(settings, "location", false)).toBe(false);
    expect(isSectionVisibleToViewer(settings, "location", true)).toBe(true);
  });

  it("gives a public section to everyone", () => {
    const settings = { ...DEFAULT_VISIBILITY, location: "public" as const };
    expect(isSectionVisibleToViewer(settings, "location", false)).toBe(true);
  });

  it("reads the section asked for, not a fixed one", () => {
    // DEFAULT_VISIBILITY: stats public, equipment friends, location private.
    expect(isSectionVisibleToViewer(DEFAULT_VISIBILITY, "stats", false)).toBe(
      true,
    );
    expect(
      isSectionVisibleToViewer(DEFAULT_VISIBILITY, "equipment", false),
    ).toBe(false);
    expect(
      isSectionVisibleToViewer(DEFAULT_VISIBILITY, "location", false),
    ).toBe(false);
  });
});
