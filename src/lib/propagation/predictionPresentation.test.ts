import { describe, expect, it } from "vitest";
import { predictionIssueLabels } from "./predictionPresentation";

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
      "Recent path history is unavailable; served by the physics profile",
    ]);
  });

  it("keeps unknown diagnostics readable without hiding them", () => {
    expect(predictionIssueLabels({ ood_flags: ["future_flag"] })).toEqual([
      "future flag",
    ]);
  });
});
