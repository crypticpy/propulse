import { beforeEach, describe, expect, it } from "vitest";
import { useDisplayQualityStore } from "./displayQualityStore";

describe("displayQualityStore", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-display-quality");
    useDisplayQualityStore.setState({ displayQuality: "auto" });
  });

  it("persists one quality preference for every map presentation", () => {
    useDisplayQualityStore.getState().setDisplayQuality("extreme");

    expect(useDisplayQualityStore.getState().displayQuality).toBe("extreme");
    expect(localStorage.getItem("propulse-display-quality")).toBe("extreme");
  });
});
