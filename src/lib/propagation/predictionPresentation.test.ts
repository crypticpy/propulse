import { describe, expect, it } from "vitest";
import {
  predictionIssueLabels,
  unsupportedChainReason,
} from "./predictionPresentation";

describe("predictionIssueLabels", () => {
  it("turns service flags into actionable operator language", () => {
    expect(
      predictionIssueLabels({
        ood_flags: [
          "missing_features",
          "recent_network_stale_physics_fallback",
        ],
      }),
    ).toEqual([
      "Some model inputs are unavailable",
      "Recent path history is stale or unavailable; served by the physics profile",
    ]);
  });

  it("keeps unknown diagnostics readable without hiding them", () => {
    expect(predictionIssueLabels({ ood_flags: ["future_flag"] })).toEqual([
      "future flag",
    ]);
  });
});

describe("unsupportedChainReason", () => {
  it("names the chain part that blocks the band", () => {
    expect(
      unsupportedChainReason(["antenna_band_unsupported", "feedline_loss_unknown"]),
    ).toBe("Chain unsupported: antenna does not declare this band");
    expect(unsupportedChainReason(["radio_band_unsupported"])).toBe(
      "Chain unsupported: radio does not declare this band",
    );
  });

  it("prefers a missing part over a band mismatch", () => {
    expect(
      unsupportedChainReason(["radio_band_unsupported", "antenna_missing"]),
    ).toBe("Chain unsupported: chain antenna is not in your inventory");
  });

  it("falls back to the generic line for unknown codes", () => {
    expect(unsupportedChainReason([])).toBe("Chain unsupported on this band");
  });
});
