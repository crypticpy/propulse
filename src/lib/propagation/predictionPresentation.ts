import type { PropagationPrediction } from "./modelClient";

/**
 * Human-readable model diagnostics.
 *
 * The service returns stable machine identifiers for telemetry and tests. They
 * are intentionally preserved on the wire, but exposing underscore-delimited
 * identifiers in operator UI made the model's physics profile look like a
 * model crash. Keep the technical contract separate from its concise
 * explanation.
 */
const FLAG_LABELS: Record<string, string> = {
  missing_features: "Some model inputs are unavailable",
  recent_network_stale_physics_fallback:
    "Recent path history is stale or unavailable; served by the physics profile",
};

export function predictionIssueLabels(
  prediction: Pick<PropagationPrediction, "ood_flags">,
): string[] {
  return prediction.ood_flags.map(
    (flag) => FLAG_LABELS[flag] ?? flag.replace(/_/g, " "),
  );
}
